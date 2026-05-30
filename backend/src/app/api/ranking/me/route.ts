import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import * as rankingRepo from '@/db/repositories/ranking';
import { getRankingRangeDates, toRankingDate, type RankingRange } from '@/lib/ranking';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/ranking/me?date=YYYY-MM-DD&range=day|week|month
 */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const dateParam = searchParams.get('date');
  const rangeParam = searchParams.get('range') as RankingRange | null;
  const date = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)
    ? dateParam
    : toRankingDate(new Date());
  const range: RankingRange = rangeParam === 'week' || rangeParam === 'month' ? rangeParam : 'day';
  const { start, end } = getRankingRangeDates(date, range);

  const rank = range === 'day'
    ? await rankingRepo.getUserDailyRank({
      userId: session.user.id,
      date,
    })
    : await rankingRepo.getUserRangeRank({
      userId: session.user.id,
      startDate: start,
      endDate: end,
    });

  return NextResponse.json({ date, range, rank });
}
