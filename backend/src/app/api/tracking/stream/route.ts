import { NextResponse } from 'next/server';
import { appendTrackingStream, type TrackingStreamPayload } from '@/lib/redisStream';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isValidPayload(value: unknown): value is TrackingStreamPayload {
  if (!value || typeof value !== 'object') return false;

  const payload = value as Partial<TrackingStreamPayload>;
  const hasValidRppg = payload.rPPG == null || Number.isFinite(payload.rPPG);
  const hasValidThreshold = payload.threshold == null || Number.isFinite(payload.threshold);

  return typeof payload.timestamp === 'string'
    && typeof payload.userId === 'string'
    && payload.userId.length > 0
    && typeof payload.sessionId === 'string'
    && payload.sessionId.length > 0
    && Number.isFinite(payload.gazeX)
    && Number.isFinite(payload.gazeY)
    && Number.isFinite(payload.heartRate)
    && hasValidRppg
    && hasValidThreshold;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!isValidPayload(body)) {
      return NextResponse.json({ error: 'invalid tracking payload' }, { status: 400 });
    }

    const result = await appendTrackingStream(body);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'tracking stream write failed';
    console.error('[Tracking Stream] Redis write failed:', error);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
