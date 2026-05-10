import { NextResponse } from 'next/server';
import { deleteRppgSession, startRppgSession } from '@/lib/facephys/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RppgSessionBody {
  sessionId?: string;
  fps?: number;
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({})) as RppgSessionBody;
    const session = await startRppgSession({ sessionId: body.sessionId, fps: body.fps });
    return NextResponse.json({ sessionId: session.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'FacePhys rPPG session failed';
    console.error('[FacePhys rPPG] session route failed:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const body = await request.json().catch(() => ({})) as RppgSessionBody;
    if (!body.sessionId) {
      return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
    }
    deleteRppgSession(body.sessionId);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'FacePhys rPPG session cleanup failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
