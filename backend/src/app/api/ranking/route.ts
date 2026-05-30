import { NextResponse } from 'next/server';
import * as rankingRepo from '@/db/repositories/ranking';
import * as redis from '@/db/redis';
import { getRankingRangeDates, toRankingDate, type RankingRange } from '@/lib/ranking';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/ranking?date=YYYY-MM-DD&range=day|week|month&limit=20
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const dateParam = searchParams.get('date');
  const rangeParam = searchParams.get('range') as RankingRange | null;
  const limitParam = searchParams.get('limit');

  const date = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)
    ? dateParam
    : toRankingDate(new Date());
  const range: RankingRange = rangeParam === 'week' || rangeParam === 'month' ? rangeParam : 'day';
  const limit = Math.min(100, Math.max(1, Number(limitParam ?? 20) || 20));
  const { start, end } = getRankingRangeDates(date, range);
  const cacheKey = range === 'day' ? `day:${start}` : `${range}:${start}:${end}`;

  const cached = await redis.getLeaderboardCache<rankingRepo.LeaderboardEntry[]>(cacheKey, limit);
  if (cached) {
    return NextResponse.json({ date, range, entries: cached, cached: true });
  }

  const entries = range === 'day'
    ? await rankingRepo.getDailyLeaderboard({ date, limit })
    : await rankingRepo.getRangeLeaderboard({ startDate: start, endDate: end, limit });

  await redis.setLeaderboardCache(cacheKey, limit, entries);

  return NextResponse.json({ date, range, entries, cached: false });
}
