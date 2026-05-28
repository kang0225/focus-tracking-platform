import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import * as usersRepo from '@/db/repositories/users';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/me/settings
 * 본인 대시보드 설정 (오늘 목표 / D-DAY / 한 줄 각오) 조회.
 */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const settings = await usersRepo.getUserSettings(session.user.id);
  return NextResponse.json({ settings });
}

/**
 * PATCH /api/me/settings
 * 부분 업데이트. body 의 키만 갱신, 나머지는 그대로.
 *
 * body: { dailyGoalHours?, ddayDate?, ddayLabel?, dailyMotto? }
 *   - ddayDate: "YYYY-MM-DD" 또는 "" (지움)
 *   - ddayLabel / dailyMotto: 빈 문자열은 null 로 저장
 */
export async function PATCH(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: Partial<usersRepo.UserSettings>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const patch: Partial<usersRepo.UserSettings> = {};
  if (typeof body.dailyGoalHours === 'number' && Number.isFinite(body.dailyGoalHours)) {
    patch.dailyGoalHours = body.dailyGoalHours;
  }
  if (body.ddayDate !== undefined) {
    if (body.ddayDate === null || body.ddayDate === '') {
      patch.ddayDate = null;
    } else if (typeof body.ddayDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.ddayDate)) {
      patch.ddayDate = body.ddayDate;
    }
  }
  if (body.ddayLabel !== undefined) {
    patch.ddayLabel = typeof body.ddayLabel === 'string' ? body.ddayLabel : null;
  }
  if (body.dailyMotto !== undefined) {
    patch.dailyMotto = typeof body.dailyMotto === 'string' ? body.dailyMotto : null;
  }

  const updated = await usersRepo.updateUserSettings(session.user.id, patch);
  return NextResponse.json({ settings: updated });
}
