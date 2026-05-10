import { NextResponse } from 'next/server';
import { runRppgFrame } from '@/lib/facephys/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RppgFrameBody {
  sessionId?: string;
  frame?: number[];
  dims?: number[];
  timestampMs?: number;
  fps?: number;
  reset?: boolean;
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as RppgFrameBody;
    if (!body.frame) {
      return NextResponse.json({ error: 'frame is required' }, { status: 400 });
    }

    const result = await runRppgFrame({
      sessionId: body.sessionId,
      frame: body.frame,
      dims: body.dims,
      timestampMs: body.timestampMs,
      fps: body.fps,
      reset: body.reset,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'FacePhys rPPG inference failed';
    console.error('[FacePhys rPPG] frame route failed:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
