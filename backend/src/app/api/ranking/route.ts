import { NextResponse } from 'next/server';
import * as rankingRepo from '@/db/repositories/ranking';
import * as redis from '@/db/redis';
import { toRankingDate } from '@/lib/ranking';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Range = 'day' | 'week' | 'month';

/**
 * Range 기준 시작·끝 일자 계산. 모두 "YYYY-MM-DD" 문자열로 반환.
 *  - day  : 그 날 단일
 *  - week : 그 날이 속한 주 (월요일 ~ 일요일)
 *  - month: 그 날이 속한 월 (1일 ~ 말일)
 */
function rangeDates(dateStr: string, range: Range): { start: string; end: string } {
  const d = new Date(`${dateStr}T00:00:00Z`);
  if (range === 'day') return { start: dateStr, end: dateStr };
  if (range === 'week') {
    const day = d.getUTCDay(); // 0=일, 1=월, ..., 6=토
    const offsetToMonday = day === 0 ? 6 : day - 1;
    const monday = new Date(d);
    monday.setUTCDate(d.getUTCDate() - offsetToMonday);
    const sunday = new Date(monday);
    sunday.setUTCDate(monday.getUTCDate() + 6);
    return { start: toRankingDate(monday), end: toRankingDate(sunday) };
  }
  // month
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
  return { start: toRankingDate(start), end: toRankingDate(end) };
}

/**
 * 리더보드 endpoint.
 *
 * GET /api/ranking?date=YYYY-MM-DD&range=day|week|month&limit=20
 *
 * - 인증 불필요 (Gooroomee 스타일 — 누구나 랭킹 열람)
 * - range=week|month 는 일별 best 세션 합산
 * - Redis 30초 캐시
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const dateParam = searchParams.get('date');
  const rangeParam = searchParams.get('range') as Range | null;
  const limitParam = searchParams.get('limit');

  const date = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)
    ? dateParam
    : toRankingDate(new Date());
  const range: Range = rangeParam === 'week' || rangeParam === 'month' ? rangeParam : 'day';
  const limit = Math.min(100, Math.max(1, Number(limitParam ?? 20) || 20));

  // 캐시 키는 range 포함.
  const cacheKey = `${range}:${date}`;
  const cached = await redis.getLeaderboardCache<rankingRepo.LeaderboardEntry[]>(cacheKey, limit);
  if (cached) {
    return NextResponse.json({ date, range, entries: cached, cached: true });
  }

  const { start, end } = rangeDates(date, range);
  const entries = range === 'day'
    ? await rankingRepo.getDailyLeaderboard({ date, limit })
    : await rankingRepo.getRangeLeaderboard({ startDate: start, endDate: end, limit });

  await redis.setLeaderboardCache(cacheKey, limit, entries);

  return NextResponse.json({ date, range, entries, cached: false });
}
