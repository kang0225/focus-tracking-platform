import {
  pgTable,
  uuid,
  text,
  timestamp,
  real,
  integer,
  jsonb,
  boolean,
  smallint,
  pgEnum,
  index,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users';
import { rooms } from './rooms';

export const trackingJobStatusEnum = pgEnum('tracking_job_status', [
  'queued',
  'processing',
  'completed',
  'failed',
]);

export const trackingJobReasonEnum = pgEnum('tracking_job_reason', [
  'finish',
  'leave',
]);

export const trackingPageEnum = pgEnum('tracking_page', ['solo', 'room']);

/**
 * 한 번의 집중 측정 세션. 라이브 중에는 Redis 에 sample stream 만 쌓고,
 * 종료 시 summary_json 으로 다운샘플된 통계를 영속 저장.
 *
 * 랭킹 컬럼은 ML 분석 완료 + pause_seconds 확정 후 finalizeSessionRanking 으로 채움.
 *   - valid_seconds      : duration_seconds - pause_seconds
 *   - high_focus_seconds : valid 구간 중 focusIsFocused=true 였던 누적 초
 *   - ranking_score      : lib/ranking.ts 의 computeRankingScore 결과
 *   - ranking_eligible   : valid_seconds >= 600 (10분) 일 때 true
 *   - ranking_formula_version : 공식 버전 (현재 1)
 */
export const trackingSessions = pgTable(
  'tracking_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    roomId: text('room_id').references(() => rooms.id, { onDelete: 'set null' }),
    page: trackingPageEnum('page').notNull().default('solo'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    focusThreshold: real('focus_threshold'),
    durationSeconds: integer('duration_seconds'),
    avgBpm: real('avg_bpm'),
    focusRatio: real('focus_ratio'),
    summaryJson: jsonb('summary_json'),

    // 랭킹용 컬럼.
    pauseSeconds: integer('pause_seconds').notNull().default(0),
    validSeconds: integer('valid_seconds'),
    highFocusSeconds: integer('high_focus_seconds'),
    rankingScore: real('ranking_score'),
    rankingEligible: boolean('ranking_eligible').notNull().default(false),
    rankingFormulaVersion: smallint('ranking_formula_version').notNull().default(1),
    rankingDate: text('ranking_date'),
  },
  (t) => [
    index('tracking_sessions_user_started_idx').on(t.userId, t.startedAt),
    index('tracking_sessions_room_idx').on(t.roomId),
    index('tracking_sessions_ranking_idx')
      .on(t.rankingDate, t.rankingScore)
      .where(sql`${t.rankingEligible} = true`),
    index('tracking_sessions_user_ranking_idx')
      .on(t.userId, t.rankingDate, t.rankingScore)
      .where(sql`${t.rankingEligible} = true`),
  ],
);

/**
 * 일시정지 구간. paused_at 부터 resumed_at 까지가 한 pause.
 * pause_seconds 는 SUM(EXTRACT(EPOCH FROM resumed_at - paused_at)) 으로 환산.
 * resumed_at IS NULL 이면 아직 진행 중인 pause.
 */
export const trackingPauses = pgTable(
  'tracking_pauses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => trackingSessions.id, { onDelete: 'cascade' }),
    pausedAt: timestamp('paused_at', { withTimezone: true }).notNull(),
    resumedAt: timestamp('resumed_at', { withTimezone: true }),
    reason: text('reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('tracking_pauses_session_idx').on(t.sessionId),
  ],
);

/**
 * 1분 단위 집계 metrics. 종료 시 또는 라이브 중 주기적으로 적재.
 * raw 샘플은 Redis 에만 두고 RDS 부담을 피한다.
 */
export const trackingMinuteSamples = pgTable(
  'tracking_minute_samples',
  {
    sessionId: uuid('session_id')
      .notNull()
      .references(() => trackingSessions.id, { onDelete: 'cascade' }),
    minuteIndex: integer('minute_index').notNull(),
    bucketStart: timestamp('bucket_start', { withTimezone: true }).notNull(),
    avgHeartRate: real('avg_heart_rate'),
    avgFocusScore: real('avg_focus_score'),
    focusRatio: real('focus_ratio'),
    sampleCount: integer('sample_count').notNull().default(0),
  },
  (t) => [
    index('tracking_minute_samples_session_idx').on(t.sessionId, t.minuteIndex),
  ],
);

/**
 * ML 분석 작업. 기존 redisStream.ts 의 TrackingAnalysisJobStatus 를 영속화.
 * status, result_json 은 Redis 와 이중 보관 (Redis 는 실시간, Postgres 는 이력).
 */
export const trackingJobs = pgTable(
  'tracking_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    sessionId: uuid('session_id').references(() => trackingSessions.id, {
      onDelete: 'set null',
    }),
    meetingId: text('meeting_id').notNull(),
    page: trackingPageEnum('page').notNull(),
    reason: trackingJobReasonEnum('reason').notNull(),
    status: trackingJobStatusEnum('status').notNull().default('queued'),
    requestedAt: timestamp('requested_at', { withTimezone: true }).notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    resultJson: jsonb('result_json'),
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('tracking_jobs_user_created_idx').on(t.userId, t.createdAt),
    index('tracking_jobs_status_idx').on(t.status),
  ],
);

/**
 * LLM 피드백 본문 보관. 한 job 에 여러 버전이 생길 수 있어 별도 테이블.
 */
export const mlFeedback = pgTable(
  'ml_feedback',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    jobId: uuid('job_id')
      .notNull()
      .references(() => trackingJobs.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    contentMd: text('content_md').notNull(),
    model: text('model'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('ml_feedback_job_idx').on(t.jobId),
    index('ml_feedback_user_idx').on(t.userId),
  ],
);

export type TrackingSessionRow = typeof trackingSessions.$inferSelect;
export type NewTrackingSessionRow = typeof trackingSessions.$inferInsert;
export type TrackingPauseRow = typeof trackingPauses.$inferSelect;
export type NewTrackingPauseRow = typeof trackingPauses.$inferInsert;
export type TrackingMinuteSampleRow = typeof trackingMinuteSamples.$inferSelect;
export type NewTrackingMinuteSampleRow = typeof trackingMinuteSamples.$inferInsert;
export type TrackingJobRow = typeof trackingJobs.$inferSelect;
export type NewTrackingJobRow = typeof trackingJobs.$inferInsert;
export type MlFeedbackRow = typeof mlFeedback.$inferSelect;
export type NewMlFeedbackRow = typeof mlFeedback.$inferInsert;
