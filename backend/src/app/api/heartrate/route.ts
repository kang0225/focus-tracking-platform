import { NextResponse } from 'next/server';
import * as pairingRepo from '@/db/repositories/pairing';
import * as redis from '@/db/redis';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Apple Watch 또는 모바일 앱이 페어링 코드와 함께 heartRate 를 주기적으로 보내는 endpoint.
 *
 * 인증 패턴: 외부 디바이스라 세션 쿠키 없음 → pairingCode 자체가 식별/인증 토큰 역할.
 * pairing_codes 테이블에서 코드 유효성 확인 후 issuer_user_id 의 Redis Watch metrics 갱신.
 *
 * PC 쪽은 /api/pair/current 에서 active_pairings + Redis Watch metrics 를 조합해 읽음.
 */

interface WatchMetricsRequest {
  pairingCode?: string;
  heartRate?: unknown;
  appleWatchPaired?: boolean;
}

function finiteNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as WatchMetricsRequest;
    const { pairingCode, appleWatchPaired } = body;

    if (!pairingCode) {
      return NextResponse.json({ error: 'pairingCode is required' }, { status: 400 });
    }

    // pairing_codes 테이블에서 코드 검증 + issuer_user_id 확보.
    const codeRow = await pairingRepo.findPairingCodeById(pairingCode);
    if (!codeRow) {
      return NextResponse.json({ error: 'Invalid Code' }, { status: 404 });
    }
    const userId = codeRow.issuerUserId;

    const previousMetrics = await redis.getWatchHeartRate(userId);

    // Watch는 웹캠 측정 경험을 보조하는 심박 수신값으로만 보관한다.
    const heartRate = finiteNumber(body.heartRate) ?? previousMetrics?.heartRate ?? 0;
    const hasWatchMetrics = heartRate > 0;

    // Redis Watch metrics 갱신 — PC 쪽이 /api/pair/current 에서 읽어감.
    await redis.setWatchHeartRate(userId, {
      heartRate,
      updatedAt: Date.now(),
    });

    // active_pairings 의 appleWatchPaired 플래그 갱신 (없으면 무시).
    if (appleWatchPaired || hasWatchMetrics) {
      try {
        await pairingRepo.markApplePaired(userId);
      } catch (err) {
        // active_pairings 행이 아직 없을 수 있음 — 무시.
        console.warn('[heartrate] markApplePaired skipped:', err);
      }
    }

    console.log(`[heartrate] code=${pairingCode} user=${userId.slice(0, 8)}… bpm=${heartRate}`);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[heartrate] failed:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
