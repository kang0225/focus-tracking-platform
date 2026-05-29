import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { appendTrackingStream, type TrackingStreamPayload } from '@/lib/redisStream';
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isValidPayload(value: unknown): value is TrackingStreamPayload {
  if (!value || typeof value !== 'object') return false;

  const payload = value as Partial<TrackingStreamPayload>;
  return typeof payload.meetingId === 'string'
    && payload.meetingId.length > 0
    && typeof payload.timestamp === 'string'
    && typeof payload.heartRate === 'number'
    && typeof payload.heartRateSource === 'string'
    && !!payload.gaze
    && typeof payload.gaze.x === 'number'
    && typeof payload.gaze.y === 'number'
    && typeof payload.gaze.calibrated === 'boolean';
}

export async function POST(request: Request) {
  try {
    // 매 초 호출되는 endpoint — sessions 테이블 lookup 비싸므로 서명만 검증.
    // userId 는 HMAC 서명된 토큰에 박혀있어 위조 불가, DB lookup 없이 안전하게 사용.
    const cookieStore = await cookies();
    const claims = verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value);
    if (!claims) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    if (!isValidPayload(body)) {
      return NextResponse.json({ error: 'invalid tracking payload' }, { status: 400 });
    }

    // 클라이언트가 보낸 어떤 userId 도 신뢰하지 않고, 인증된 세션의 user_id 를 강제 사용.
    const result = await appendTrackingStream(body, claims.userId);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'tracking stream write failed';
    console.error('[Tracking Stream] Redis write failed:', error);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
