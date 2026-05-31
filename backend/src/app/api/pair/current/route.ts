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
 *   페어링 활성   → { status:'active', heartRate, appleWatchPaired, ... }
 *   페어링 없음   → 200 + { active:false }
 *   미인증        → 401 + { active:false }
 *
 * Apple Watch 가 /api/heartrate 로 보낸 heartRate 를 Redis Watch metrics 에서 읽어 합쳐 응답.
 */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ active: false }, { status: 401 });
  }

  const pairing = await pairingRepo.getActivePairing(session.user.id);
  const watchMetrics = await redis.getWatchHeartRate(session.user.id);
  const legacyLiveMetrics = await redis.getLiveMetrics(session.user.id);
  const legacyWatchMetrics = legacyLiveMetrics?.heartRateSource === 'Apple Watch'
    ? legacyLiveMetrics
    : null;
  const appleWatchMetrics = watchMetrics ?? legacyWatchMetrics;

  // active_pairings 행은 없어도 watch 가 heartrate 만 보낸 상태면 Watch metrics 는 있을 수 있음.
  // 기존 동작 호환: 이전 live metrics 키에 남은 Apple Watch 값도 fallback 으로 허용.
  if (!pairing && !appleWatchMetrics) {
    return NextResponse.json({ active: false });
  }

  return NextResponse.json({
    status: 'active' as const,
    establishedAt: pairing?.establishedAt.getTime() ?? null,
    updatedAt: appleWatchMetrics?.updatedAt ?? pairing?.updatedAt.getTime() ?? Date.now(),
    appleWatchPaired: pairing?.appleWatchPaired === 'true'
      || !!appleWatchMetrics,
    heartRate: appleWatchMetrics?.heartRate ?? 0,
    focusScore: null,
    focusThreshold: null,
    focusIsFocused: null,
  });
}
