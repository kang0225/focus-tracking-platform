import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import * as pairingRepo from '@/db/repositories/pairing';
import * as redis from '@/db/redis';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const WATCH_METRICS_TIMEOUT_MS = 800;

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

async function readWithTimeout<T>(
  label: string,
  read: () => Promise<T>,
  fallback: T,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  try {
    return await Promise.race([
      read(),
      new Promise<T>((resolve) => {
        timeoutId = setTimeout(() => {
          console.warn(`[pair/current] ${label} timed out.`);
          resolve(fallback);
        }, WATCH_METRICS_TIMEOUT_MS);
      }),
    ]);
  } catch (error) {
    console.warn(`[pair/current] failed to read ${label}:`, error);
    return fallback;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ active: false }, { status: 401 });
  }

  const pairing = await pairingRepo.getActivePairingStatus(session.user.id);

  if (!pairing) {
    return NextResponse.json({ active: false });
  }

  const watchMetrics = await readWithTimeout(
    'watch metrics',
    () => redis.getWatchHeartRate(session.user.id),
    null,
  );
  const legacyLiveMetrics = watchMetrics
    ? null
    : await readWithTimeout(
        'legacy metrics',
        () => redis.getLiveMetrics(session.user.id),
        null,
      );

  const legacyWatchMetrics = legacyLiveMetrics?.heartRateSource === 'Apple Watch'
    ? legacyLiveMetrics
    : null;
  const appleWatchMetrics = watchMetrics ?? legacyWatchMetrics;

  return NextResponse.json({
    status: 'active' as const,
    establishedAt: pairing?.establishedAt?.getTime() ?? null,
    updatedAt: appleWatchMetrics?.updatedAt ?? pairing?.updatedAt?.getTime() ?? Date.now(),
    appleWatchPaired: pairing?.appleWatchPaired || !!appleWatchMetrics,
    heartRate: appleWatchMetrics?.heartRate ?? 0,
    focusScore: null,
    focusThreshold: null,
    focusIsFocused: null,
  });
}
