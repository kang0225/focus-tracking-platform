import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../client';
import {
  trackingSessions,
  trackingPauses,
  type TrackingSessionRow,
} from '../schema/tracking';
import { users } from '../schema/users';
import {
  computeRankingScore,
  highFocusSecondsFromRatio,
  toRankingDate,
  RANKING_FORMULA_VERSION,
} from '@/lib/ranking';

// ────────────────────────────────────────────────────────────
// Pause 관리
// ────────────────────────────────────────────────────────────

export async function startPause(input: {
  sessionId: string;
  reason?: string | null;
  at?: Date;
}): Promise<void> {
  // 이미 열린 pause 가 있으면 idempotent — 추가 row 만들지 않음.
  const open = await db
    .select({ id: trackingPauses.id })
    .from(trackingPauses)
    .where(
      and(eq(trackingPauses.sessionId, input.sessionId), isNull(trackingPauses.resumedAt)),
    )
    .limit(1);
  if (open[0]) return;

  await db.insert(trackingPauses).values({
    sessionId: input.sessionId,
    pausedAt: input.at ?? new Date(),
    reason: input.reason ?? null,
  });
}

export async function endPause(input: {
  sessionId: string;
  at?: Date;
}): Promise<void> {
  await db
    .update(trackingPauses)
    .set({ resumedAt: input.at ?? new Date() })
    .where(
      and(eq(trackingPauses.sessionId, input.sessionId), isNull(trackingPauses.resumedAt)),
    );
}

/**
 * 세션 종료 시점에 finalize 단계에서 호출. 닫히지 않은 pause 가 있으면 강제 종료.
 * 누적 pause 초 반환.
 */
export async function closeOpenPausesAndSum(input: {
  sessionId: string;
  closedAt?: Date;
}): Promise<number> {
  const closedAt = input.closedAt ?? new Date();
  await db
    .update(trackingPauses)
    .set({ resumedAt: closedAt })
    .where(
      and(eq(trackingPauses.sessionId, input.sessionId), isNull(trackingPauses.resumedAt)),
    );

  const result = await db
    .select({
      total: sql<number>`coalesce(sum(extract(epoch from (${trackingPauses.resumedAt} - ${trackingPauses.pausedAt})))::int, 0)`,
    })
    .from(trackingPauses)
    .where(eq(trackingPauses.sessionId, input.sessionId));

  return result[0]?.total ?? 0;
}

// ────────────────────────────────────────────────────────────
// 세션 finalize → 랭킹 컬럼 채우기
// ────────────────────────────────────────────────────────────

export interface FinalizeRankingInput {
  sessionId: string;
  focusRatio: number;       // ML job 결과 (validSeconds 기준)
  durationSeconds: number;  // started_at ~ ended_at
  highFocusSeconds?: number; // 안 주면 focusRatio × validSeconds 로 보정
  closedAt?: Date;
}

export interface FinalizeRankingResult {
  session: TrackingSessionRow;
  pauseSeconds: number;
  validSeconds: number;
  rankingScore: number;
  eligible: boolean;
  rankingDate: string;
}

/**
 * 세션 종료 + ML job 완료 후 호출하면:
 *   1. 열린 pause 닫고 누적 pause_seconds 산출
 *   2. validSeconds = max(0, durationSeconds - pause_seconds)
 *   3. computeRankingScore() 로 score / eligible 계산
 *   4. tracking_sessions 의 랭킹 컬럼 업데이트
 */
export async function finalizeSessionRanking(
  input: FinalizeRankingInput,
): Promise<FinalizeRankingResult> {
  const closedAt = input.closedAt ?? new Date();
  const pauseSeconds = await closeOpenPausesAndSum({
    sessionId: input.sessionId,
    closedAt,
  });
  const validSeconds = Math.max(0, input.durationSeconds - pauseSeconds);
  const result = computeRankingScore({
    focusRatio: input.focusRatio,
    validSeconds,
  });
  const highFocusSeconds =
    input.highFocusSeconds ??
    highFocusSecondsFromRatio({ focusRatio: input.focusRatio, validSeconds });
  const rankingDate = toRankingDate(closedAt);

  const updated = await db
    .update(trackingSessions)
    .set({
      pauseSeconds,
      validSeconds,
      highFocusSeconds,
      rankingScore: result.score,
      rankingEligible: result.eligible,
      rankingFormulaVersion: RANKING_FORMULA_VERSION,
      rankingDate,
    })
    .where(eq(trackingSessions.id, input.sessionId))
    .returning();

  if (!updated[0]) {
    throw new Error(`Session not found for ranking finalize: ${input.sessionId}`);
  }

  return {
    session: updated[0],
    pauseSeconds,
    validSeconds,
    rankingScore: result.score,
    eligible: result.eligible,
    rankingDate,
  };
}

// ────────────────────────────────────────────────────────────
// 일별 리더보드 쿼리
// ────────────────────────────────────────────────────────────

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  bestSessionId: string;
  rankingScore: number;
  highFocusSeconds: number;
  validSeconds: number;
  focusRatio: number;
  rankingDate: string;
}

/**
 * 특정 일자의 리더보드 top N. 사용자당 최고 점수 1개만.
 * 동점 시 highFocusSeconds 가 큰 사용자 우선.
 *
 * 쿼리 전략:
 *   DISTINCT ON (user_id) 로 사용자별 최고 세션 1개 추출 →
 *   바깥쪽에서 ORDER BY rankingScore DESC, highFocusSeconds DESC LIMIT N.
 */
export async function getDailyLeaderboard(input: {
  date: string;       // "YYYY-MM-DD"
  limit?: number;
}): Promise<LeaderboardEntry[]> {
  const limit = Math.max(1, Math.min(500, input.limit ?? 100));

  // DISTINCT ON 은 Drizzle 의 select 빌더로 표현이 까다로워 raw SQL 사용.
  // 매개변수 바인딩은 sql.placeholder / 직접 바인딩 사용.
  const rows = await db.execute(sql`
    SELECT
      bests.user_id           AS "userId",
      bests.session_id        AS "bestSessionId",
      bests.ranking_score     AS "rankingScore",
      bests.high_focus_seconds AS "highFocusSeconds",
      bests.valid_seconds     AS "validSeconds",
      bests.focus_ratio       AS "focusRatio",
      bests.ranking_date      AS "rankingDate",
      u.name                  AS "displayName",
      u.avatar_url            AS "avatarUrl"
    FROM (
      SELECT DISTINCT ON (user_id)
        user_id,
        id AS session_id,
        ranking_score,
        coalesce(high_focus_seconds, 0) AS high_focus_seconds,
        coalesce(valid_seconds, 0) AS valid_seconds,
        coalesce(focus_ratio, 0) AS focus_ratio,
        ranking_date
      FROM tracking_sessions
      WHERE ranking_eligible = true
        AND ranking_date = ${input.date}
      ORDER BY user_id, ranking_score DESC NULLS LAST, high_focus_seconds DESC NULLS LAST
    ) AS bests
    JOIN users u ON u.id = bests.user_id
    ORDER BY bests.ranking_score DESC NULLS LAST, bests.high_focus_seconds DESC NULLS LAST
    LIMIT ${limit}
  `);

  // pg / pglite 모두 .rows 에 결과 배열 반환.
  // drizzle execute 의 반환 타입은 dialect 에 따라 다르므로 안전하게 둘 다 처리.
  const rawRows: Record<string, unknown>[] = Array.isArray(rows)
    ? (rows as Record<string, unknown>[])
    : ((rows as { rows?: Record<string, unknown>[] }).rows ?? []);

  return rawRows.map((r, i): LeaderboardEntry => ({
    rank: i + 1,
    userId: String(r.userId),
    displayName: String(r.displayName ?? ''),
    avatarUrl: r.avatarUrl == null ? null : String(r.avatarUrl),
    bestSessionId: String(r.bestSessionId),
    rankingScore: Number(r.rankingScore),
    highFocusSeconds: Number(r.highFocusSeconds),
    validSeconds: Number(r.validSeconds),
    focusRatio: Number(r.focusRatio),
    rankingDate: String(r.rankingDate),
  }));
}

/**
 * 특정 사용자의 해당 일자 순위. 본인 점수 + 전체 순위 + 총원 반환.
 * 리더보드 카드에서 "내 순위" 표시용.
 */
export interface UserDailyRank {
  rank: number;
  total: number;
  bestSessionId: string;
  rankingScore: number;
  highFocusSeconds: number;
  validSeconds: number;
}

export async function getUserDailyRank(input: {
  userId: string;
  date: string;
}): Promise<UserDailyRank | null> {
  // 1) 사용자 최고 세션
  const bestRows = await db
    .select({
      sessionId: trackingSessions.id,
      rankingScore: trackingSessions.rankingScore,
      highFocusSeconds: trackingSessions.highFocusSeconds,
      validSeconds: trackingSessions.validSeconds,
    })
    .from(trackingSessions)
    .where(
      and(
        eq(trackingSessions.userId, input.userId),
        eq(trackingSessions.rankingEligible, true),
        eq(trackingSessions.rankingDate, input.date),
      ),
    )
    .orderBy(
      desc(trackingSessions.rankingScore),
      desc(trackingSessions.highFocusSeconds),
    )
    .limit(1);

  const best = bestRows[0];
  if (!best || best.rankingScore == null) return null;

  // 2) 본인보다 점수가 높은 (또는 동점이지만 highFocus 가 더 큰) 사용자 수 = rank - 1
  const aboveRows = await db.execute(sql`
    SELECT count(*)::int AS "above"
    FROM (
      SELECT DISTINCT ON (user_id) user_id, ranking_score, coalesce(high_focus_seconds, 0) AS hfs
      FROM tracking_sessions
      WHERE ranking_eligible = true
        AND ranking_date = ${input.date}
        AND user_id <> ${input.userId}
      ORDER BY user_id, ranking_score DESC NULLS LAST, high_focus_seconds DESC NULLS LAST
    ) o
    WHERE o.ranking_score > ${best.rankingScore!}
       OR (o.ranking_score = ${best.rankingScore!} AND o.hfs > ${best.highFocusSeconds ?? 0})
  `);

  const totalRows = await db.execute(sql`
    SELECT count(DISTINCT user_id)::int AS "total"
    FROM tracking_sessions
    WHERE ranking_eligible = true AND ranking_date = ${input.date}
  `);

  const aboveRaw: Record<string, unknown>[] = Array.isArray(aboveRows)
    ? (aboveRows as Record<string, unknown>[])
    : ((aboveRows as { rows?: Record<string, unknown>[] }).rows ?? []);
  const totalRaw: Record<string, unknown>[] = Array.isArray(totalRows)
    ? (totalRows as Record<string, unknown>[])
    : ((totalRows as { rows?: Record<string, unknown>[] }).rows ?? []);

  const above = Number(aboveRaw[0]?.above ?? 0);
  const total = Number(totalRaw[0]?.total ?? 1);

  return {
    rank: above + 1,
    total,
    bestSessionId: best.sessionId,
    rankingScore: Number(best.rankingScore),
    highFocusSeconds: Number(best.highFocusSeconds ?? 0),
    validSeconds: Number(best.validSeconds ?? 0),
  };
}

// users import 가 컴파일러에 안 잡히는 경우가 있어 export 로 활용.
export { users as _usersForJoin };

// ────────────────────────────────────────────────────────────
// 기간 (주/월) 리더보드 — 일별 best 세션을 SUM 으로 합산.
// ────────────────────────────────────────────────────────────

/**
 * 기간 리더보드. startDate ~ endDate (둘 다 inclusive, "YYYY-MM-DD") 안의
 * "사용자 × 일별 best 세션" 들을 user_id 로 groupBy 해서 합산.
 *
 * 정렬: 누적 ranking_score 내림차순.
 */
export async function getRangeLeaderboard(input: {
  startDate: string;
  endDate: string;
  limit?: number;
}): Promise<LeaderboardEntry[]> {
  const limit = Math.max(1, Math.min(500, input.limit ?? 100));

  const rows = await db.execute(sql`
    SELECT
      best_per_day.user_id          AS "userId",
      sum(best_per_day.ranking_score)::float       AS "rankingScore",
      sum(best_per_day.high_focus_seconds)::int    AS "highFocusSeconds",
      sum(best_per_day.valid_seconds)::int         AS "validSeconds",
      avg(best_per_day.focus_ratio)::float         AS "focusRatio",
      max(best_per_day.session_id)  AS "bestSessionId",
      max(best_per_day.ranking_date) AS "rankingDate",
      u.name                        AS "displayName",
      u.avatar_url                  AS "avatarUrl"
    FROM (
      SELECT DISTINCT ON (user_id, ranking_date)
        user_id,
        ranking_date,
        id AS session_id,
        ranking_score,
        coalesce(high_focus_seconds, 0) AS high_focus_seconds,
        coalesce(valid_seconds, 0)      AS valid_seconds,
        coalesce(focus_ratio, 0)        AS focus_ratio
      FROM tracking_sessions
      WHERE ranking_eligible = true
        AND ranking_date BETWEEN ${input.startDate} AND ${input.endDate}
      ORDER BY user_id, ranking_date, ranking_score DESC NULLS LAST, high_focus_seconds DESC NULLS LAST
    ) AS best_per_day
    JOIN users u ON u.id = best_per_day.user_id
    GROUP BY best_per_day.user_id, u.name, u.avatar_url
    ORDER BY sum(best_per_day.ranking_score) DESC NULLS LAST,
             sum(best_per_day.high_focus_seconds) DESC NULLS LAST
    LIMIT ${limit}
  `);

  const rawRows: Record<string, unknown>[] = Array.isArray(rows)
    ? (rows as Record<string, unknown>[])
    : ((rows as { rows?: Record<string, unknown>[] }).rows ?? []);

  return rawRows.map((r, i): LeaderboardEntry => ({
    rank: i + 1,
    userId: String(r.userId),
    displayName: String(r.displayName ?? ''),
    avatarUrl: r.avatarUrl == null ? null : String(r.avatarUrl),
    bestSessionId: String(r.bestSessionId ?? ''),
    rankingScore: Number(r.rankingScore ?? 0),
    highFocusSeconds: Number(r.highFocusSeconds ?? 0),
    validSeconds: Number(r.validSeconds ?? 0),
    focusRatio: Number(r.focusRatio ?? 0),
    rankingDate: String(r.rankingDate ?? input.endDate),
  }));
}
