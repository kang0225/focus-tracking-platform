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
}

function finiteNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as WatchMetricsRequest;
    const { pairingCode } = body;

    if (!pairingCode) {
      return NextResponse.json({ error: 'pairingCode is required' }, { status: 400 });
    }

    // pairing_codes 테이블에서 코드 검증 + issuer_user_id 확보.
    const codeRow = await pairingRepo.findPairingCodeById(pairingCode);
    if (!codeRow) {
      return NextResponse.json({ error: 'Invalid Code' }, { status: 404 });
    }
    const userId = codeRow.issuerUserId;

    // 유효한 pairingCode 를 보낸 순간 앱 연결은 성립한 것으로 보고 active_pairings 를 생성/갱신한다.
    // iPhone 앱의 최초 페어링 요청은 heartRate 없이 들어올 수 있다.
    let markedApplePaired = false;
    try {
      await pairingRepo.markApplePaired(userId);
      markedApplePaired = true;
    } catch (error) {
      console.warn('[heartrate] failed to mark active pairing:', error);
    }

    // Watch는 웹캠 측정 경험을 보조하는 심박 수신값으로만 보관한다.
    // 코드-only 페어링 요청은 Redis 를 기다리지 않고 빠르게 성공시킨다.
    const heartRate = finiteNumber(body.heartRate);
    const hasHeartRate = heartRate != null && heartRate > 0;
    let storedWatchMetrics = false;
    if (hasHeartRate) {
      try {
        await redis.setWatchHeartRate(userId, {
          heartRate,
          updatedAt: Date.now(),
        });
        storedWatchMetrics = true;
      } catch (error) {
        console.warn('[heartrate] failed to store watch metrics:', error);
      }
    }

    console.log(
      `[heartrate] code=${pairingCode} user=${userId.slice(0, 8)}… bpm=${heartRate ?? 0} ` +
      `stored=${storedWatchMetrics} paired=${markedApplePaired}`,
    );
    return NextResponse.json({
      success: true,
      storedWatchMetrics,
      markedApplePaired,
    });
  } catch (error) {
    console.error('[heartrate] failed:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
