import { NextResponse } from 'next/server';
import { pairingCodes, setCurrentPairing } from '@/lib/db';
import {
  classifyAndUpdateFocusThreshold,
  createInitialRppgFocusThresholdState,
  type RppgFocusThresholdState,
} from '@/lib/facephys/rppg';

const globalStore = globalThis as typeof globalThis & {
  __watchFocusThresholdStates?: Map<string, RppgFocusThresholdState>;
};

const watchFocusThresholdStates = globalStore.__watchFocusThresholdStates ??= new Map<string, RppgFocusThresholdState>();

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
    const session = pairingCodes.get(pairingCode);

    if (session) {
      const heartRate = finiteNumber(body.heartRate) ?? session.heartRate;
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
      const nextFocusThreshold = calculatedFocus?.thresholdRawScore ?? focusThreshold ?? session.focusThreshold ?? null;
      const focusIsFocused = optionalBoolean(body.focusIsFocused)
        ?? optionalBoolean(body.isFocused)
        ?? optionalBoolean(body.focused)
        ?? (
          focusScore != null && nextFocusThreshold != null
            ? focusScore >= nextFocusThreshold
            : session.focusIsFocused ?? null
        );
      const hasWatchMetrics = heartRate > 0 || focusScore != null || nextFocusThreshold != null;
      const nextSession = {
        ...session,
        heartRate,
        status: 'active' as const,
        updatedAt: Date.now(),
        appleWatchPaired: appleWatchPaired ?? session.appleWatchPaired ?? hasWatchMetrics,
        focusScore: focusScore ?? session.focusScore ?? null,
        focusThreshold: nextFocusThreshold,
        focusIsFocused,
      };

      pairingCodes.set(pairingCode, nextSession);
      setCurrentPairing(nextSession);
      console.log(`[TS-Backend] Code: ${pairingCode}, BPM: ${heartRate}, Focus metrics: ${nextSession.focusScore != null ? 'received' : 'n/a'}`);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid Code' }, { status: 404 });
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
