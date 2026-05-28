import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import * as pairingRepo from '@/db/repositories/pairing';
import * as redis from '@/db/redis';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 사용자의 활성 페어링 + 라이브 메트릭 조회.
 *
 * 응답 형식 (호환):
 *   페어링 활성   → { status:'active', heartRate, focusScore?, focusThreshold?, focusIsFocused?, ... }
 *   페어링 없음   → 200 + { active:false }
 *   미인증        → 401 + { active:false }
 *
 * heartRate 등 라이브 데이터는 Apple Watch 가 /api/heartrate 로 보낸 값이
 * Redis live metrics 에 들어있으니 그걸 읽어 합쳐 응답.
 */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ active: false }, { status: 401 });
  }

  const pairing = await pairingRepo.getActivePairing(session.user.id);
  const liveMetrics = await redis.getLiveMetrics(session.user.id);

  // active_pairings 행은 없어도 watch 가 heartrate 만 보낸 상태면 live metrics 는 있을 수 있음.
  // 기존 동작 호환: 페어링이 "active" 라고 간주하려면 active_pairings 행 또는 라이브 metrics 둘 중 하나 필요.
  if (!pairing && !liveMetrics) {
    return NextResponse.json({ active: false });
  }

  return NextResponse.json({
    status: 'active' as const,
    establishedAt: pairing?.establishedAt.getTime() ?? null,
    updatedAt: liveMetrics?.updatedAt ?? pairing?.updatedAt.getTime() ?? Date.now(),
    appleWatchPaired: pairing?.appleWatchPaired === 'true'
      || liveMetrics?.heartRateSource === 'Apple Watch',
    heartRate: liveMetrics?.heartRate ?? 0,
    focusScore: liveMetrics?.focusScore ?? null,
    focusThreshold: liveMetrics?.focusThreshold ?? null,
    focusIsFocused: liveMetrics?.focusIsFocused ?? null,
  });
}
