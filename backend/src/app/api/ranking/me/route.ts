import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import * as rankingRepo from '@/db/repositories/ranking';
import { toRankingDate } from '@/lib/ranking';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 본인 일별 순위 + 점수.
 *
 * GET /api/ranking/me?date=YYYY-MM-DD
 *
 * - date 미지정 시 오늘 (UTC).
 * - 해당 일자에 eligible 세션 없으면 null.
 */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const dateParam = searchParams.get('date');
  const date = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)
    ? dateParam
    : toRankingDate(new Date());

  const rank = await rankingRepo.getUserDailyRank({
    userId: session.user.id,
    date,
  });

  return NextResponse.json({ date, rank });
}
