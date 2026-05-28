import { NextResponse } from 'next/server';
import * as pairingRepo from '@/db/repositories/pairing';
import * as redis from '@/db/redis';
import {
  classifyAndUpdateFocusThreshold,
  createInitialRppgFocusThresholdState,
  type RppgFocusThresholdState,
} from '@/lib/facephys/rppg';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Apple Watch 또는 모바일 앱이 페어링 코드와 함께 raw heartRate / focus 메트릭을
 * 주기적으로 보내는 endpoint.
 *
 * 인증 패턴: 외부 디바이스라 세션 쿠키 없음 → pairingCode 자체가 식별/인증 토큰 역할.
 * pairing_codes 테이블에서 코드 유효성 확인 후 issuer_user_id 의 Redis live metrics 갱신.
 *
 * PC 쪽은 /api/pair/current 에서 active_pairings + Redis live metrics 를 조합해 읽음.
 */

// Focus threshold state (윈도우 기반 통계) — 짧은 lifecycle 이라 in-memory 유지.
// 운영급으로 가려면 Redis Hash 로 이전 가능.
const globalStore = globalThis as typeof globalThis & {
  __watchFocusThresholdStates?: Map<string, RppgFocusThresholdState>;
};
const watchFocusThresholdStates = globalStore.__watchFocusThresholdStates
  ??= new Map<string, RppgFocusThresholdState>();

function getWatchFocusThresholdState(pairingCode: string) {
  const existing = watchFocusThresholdStates.get(pairingCode);
  if (existing) return existing;
  const next = createInitialRppgFocusThresholdState();
  watchFocusThresholdStates.set(pairingCode, next);
  return next;
}

interface WatchMetricsRequest {
  pairingCode?: string;
  heartRate?: unknown;
  appleWatchPaired?: boolean;
  focusScore?: unknown;
  score?: unknown;
  focusRawScore?: unknown;
  rawScore?: unknown;
  focusThreshold?: unknown;
  threshold?: unknown;
  focusThresholdRawScore?: unknown;
  thresholdRawScore?: unknown;
  focusIsFocused?: unknown;
  isFocused?: unknown;
  focused?: unknown;
}

function finiteNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function firstFiniteNumber(values: unknown[]) {
  for (const value of values) {
    const number = finiteNumber(value);
    if (number != null) return number;
  }
  return null;
}

function optionalBoolean(value: unknown) {
  if (typeof value === 'boolean') return value;
  if (value === 1 || value === '1' || value === 'true') return true;
  if (value === 0 || value === '0' || value === 'false') return false;
  return null;
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

    // 입력 정규화
    const heartRate = finiteNumber(body.heartRate) ?? 0;
    const focusScore = firstFiniteNumber([
      body.focusScore,
      body.score,
      body.focusRawScore,
      body.rawScore,
    ]);
    const focusThreshold = firstFiniteNumber([
      body.focusThreshold,
      body.threshold,
      body.focusThresholdRawScore,
      body.thresholdRawScore,
    ]);
    const calculatedFocus = focusScore == null
      ? null
      : classifyAndUpdateFocusThreshold(focusScore, getWatchFocusThresholdState(pairingCode));
    const nextFocusThreshold = calculatedFocus?.thresholdRawScore ?? focusThreshold ?? null;
    const focusIsFocused = optionalBoolean(body.focusIsFocused)
      ?? optionalBoolean(body.isFocused)
      ?? optionalBoolean(body.focused)
      ?? (focusScore != null && nextFocusThreshold != null
        ? focusScore >= nextFocusThreshold
        : null);
    const hasWatchMetrics = heartRate > 0 || focusScore != null || nextFocusThreshold != null;

    // Redis live metrics 갱신 — PC 쪽이 /api/pair/current 에서 읽어감.
    await redis.setLiveMetrics(userId, {
      gazeX: 0,
      gazeY: 0,
      heartRate,
      heartRateSource: 'Apple Watch',
      focusScore: focusScore ?? 0,
      focusSource: 'Apple Watch',
      focusThreshold: nextFocusThreshold,
      focusIsFocused,
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
