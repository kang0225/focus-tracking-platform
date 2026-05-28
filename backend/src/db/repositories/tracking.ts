import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '../client';
import {
  trackingSessions,
  trackingMinuteSamples,
  trackingJobs,
  mlFeedback,
  type TrackingSessionRow,
  type TrackingJobRow,
  type NewTrackingMinuteSampleRow,
  type MlFeedbackRow,
} from '../schema/tracking';

export async function startTrackingSession(input: {
  userId: string;
  roomId?: string | null;
  page?: 'solo' | 'room';
  focusThreshold?: number | null;
}): Promise<TrackingSessionRow> {
  const rows = await db
    .insert(trackingSessions)
    .values({
      userId: input.userId,
      roomId: input.roomId ?? null,
      page: input.page ?? 'solo',
      focusThreshold: input.focusThreshold ?? null,
    })
    .returning();
  return rows[0];
}

export async function endTrackingSession(input: {
  sessionId: string;
  durationSeconds: number;
  avgBpm: number | null;
  focusRatio: number | null;
  summaryJson: unknown;
}): Promise<TrackingSessionRow | null> {
  const rows = await db
    .update(trackingSessions)
    .set({
      endedAt: new Date(),
      durationSeconds: input.durationSeconds,
      avgBpm: input.avgBpm,
      focusRatio: input.focusRatio,
      summaryJson: input.summaryJson as object | null,
    })
    .where(eq(trackingSessions.id, input.sessionId))
    .returning();
  return rows[0] ?? null;
}

export async function getTrackingSession(
  sessionId: string,
): Promise<TrackingSessionRow | null> {
  const rows = await db
    .select()
    .from(trackingSessions)
    .where(eq(trackingSessions.id, sessionId))
    .limit(1);
  return rows[0] ?? null;
}

export async function listRecentSessions(
  userId: string,
  limit: number = 20,
): Promise<TrackingSessionRow[]> {
  return db
    .select()
    .from(trackingSessions)
    .where(eq(trackingSessions.userId, userId))
    .orderBy(desc(trackingSessions.startedAt))
    .limit(limit);
}

export async function insertMinuteSamples(
  samples: NewTrackingMinuteSampleRow[],
): Promise<void> {
  if (samples.length === 0) return;
  await db.insert(trackingMinuteSamples).values(samples);
}

export async function getMinuteSamples(sessionId: string) {
  return db
    .select()
    .from(trackingMinuteSamples)
    .where(eq(trackingMinuteSamples.sessionId, sessionId))
    .orderBy(trackingMinuteSamples.minuteIndex);
}

export interface CreateTrackingJobInput {
  userId: string;
  sessionId?: string | null;
  meetingId: string;
  page: 'solo' | 'room';
  reason: 'finish' | 'leave';
  requestedAt: Date;
}

export async function createTrackingJob(
  input: CreateTrackingJobInput,
): Promise<TrackingJobRow> {
  const rows = await db
    .insert(trackingJobs)
    .values({
      userId: input.userId,
      sessionId: input.sessionId ?? null,
      meetingId: input.meetingId,
      page: input.page,
      reason: input.reason,
      requestedAt: input.requestedAt,
      status: 'queued',
    })
    .returning();
  return rows[0];
}

export async function updateTrackingJobStatus(input: {
  jobId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  resultJson?: unknown;
  error?: string | null;
}): Promise<TrackingJobRow | null> {
  const patch: Partial<TrackingJobRow> & { updatedAt: Date } = {
    status: input.status,
    updatedAt: new Date(),
  };
  if (input.status === 'completed' || input.status === 'failed') {
    patch.completedAt = new Date();
  }
  if (input.resultJson !== undefined) {
    patch.resultJson = input.resultJson as object | null;
  }
  if (input.error !== undefined) {
    patch.error = input.error;
  }

  const rows = await db
    .update(trackingJobs)
    .set(patch)
    .where(eq(trackingJobs.id, input.jobId))
    .returning();
  return rows[0] ?? null;
}

export async function getTrackingJob(jobId: string): Promise<TrackingJobRow | null> {
  const rows = await db
    .select()
    .from(trackingJobs)
    .where(eq(trackingJobs.id, jobId))
    .limit(1);
  return rows[0] ?? null;
}

export async function listUserJobs(userId: string, limit: number = 20) {
  return db
    .select()
    .from(trackingJobs)
    .where(eq(trackingJobs.userId, userId))
    .orderBy(desc(trackingJobs.createdAt))
    .limit(limit);
}

export async function insertMlFeedback(input: {
  jobId: string;
  userId: string;
  contentMd: string;
  model?: string | null;
}): Promise<MlFeedbackRow> {
  const rows = await db
    .insert(mlFeedback)
    .values({
      jobId: input.jobId,
      userId: input.userId,
      contentMd: input.contentMd,
      model: input.model ?? null,
    })
    .returning();
  return rows[0];
}

export async function listJobFeedback(jobId: string) {
  return db
    .select()
    .from(mlFeedback)
    .where(eq(mlFeedback.jobId, jobId))
    .orderBy(desc(mlFeedback.createdAt));
}

/**
 * 사용자별 집계 — 대시보드용.
 */
export async function getUserAggregateStats(userId: string) {
  const rows = await db
    .select({
      sessionCount: sql<number>`count(*)::int`,
      totalDurationSeconds: sql<number>`coalesce(sum(${trackingSessions.durationSeconds}), 0)::int`,
      avgBpm: sql<number | null>`avg(${trackingSessions.avgBpm})`,
      avgFocusRatio: sql<number | null>`avg(${trackingSessions.focusRatio})`,
    })
    .from(trackingSessions)
    .where(and(eq(trackingSessions.userId, userId), sql`${trackingSessions.endedAt} is not null`));
  return rows[0] ?? null;
}
