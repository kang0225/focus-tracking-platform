import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import * as trackingRepo from '@/db/repositories/tracking';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/tracking/sessions?limit=20
 * 본인 최근 세션 목록 + 누적 통계.
 *
 * 응답 형식:
 * {
 *   stats: { sessionCount, totalDurationSeconds, avgBpm, avgFocusRatio },
 *   sessions: [{ id, startedAt, endedAt, durationSeconds, focusRatio, avgBpm, rankingScore, ... }, ...]
 * }
 */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit') ?? 20) || 20));

  const [sessions, stats] = await Promise.all([
    trackingRepo.listRecentSessions(session.user.id, limit),
    trackingRepo.getUserAggregateStats(session.user.id),
  ]);

  return NextResponse.json({
    stats: stats ?? {
      sessionCount: 0,
      totalDurationSeconds: 0,
      avgBpm: null,
      avgFocusRatio: null,
    },
    sessions: sessions.map((s) => ({
      id: s.id,
      startedAt: s.startedAt.getTime(),
      endedAt: s.endedAt?.getTime() ?? null,
      durationSeconds: s.durationSeconds ?? 0,
      focusRatio: s.focusRatio ?? null,
      avgBpm: s.avgBpm ?? null,
      rankingScore: s.rankingScore ?? null,
      rankingEligible: s.rankingEligible,
    })),
  });
}
