import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import * as rankingRepo from '@/db/repositories/ranking';
import * as redis from '@/db/redis';
import { toRankingDate } from '@/lib/ranking';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 일별 리더보드 (Issue #163).
 *
 * GET /api/ranking?date=YYYY-MM-DD&limit=20
 *
 * - date 미지정 시 오늘 (UTC).
 * - limit 기본 20, 최대 100.
 * - 인증 필요 (자기 계정으로 본인 위치 + 전체 톱).
 * - Redis 30초 캐시.
 */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const dateParam = searchParams.get('date');
  const limitParam = searchParams.get('limit');

  const date = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)
    ? dateParam
    : toRankingDate(new Date());
  const limit = Math.min(100, Math.max(1, Number(limitParam ?? 20) || 20));

  // 1) 캐시 확인
  const cached = await redis.getLeaderboardCache<rankingRepo.LeaderboardEntry[]>(date, limit);
  if (cached) {
    return NextResponse.json({ date, entries: cached, cached: true });
  }

  // 2) DB 쿼리
  const entries = await rankingRepo.getDailyLeaderboard({ date, limit });

  // 3) 캐시 저장
  await redis.setLeaderboardCache(date, limit, entries);

  return NextResponse.json({ date, entries, cached: false });
}
