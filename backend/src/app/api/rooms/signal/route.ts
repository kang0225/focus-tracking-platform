import { NextResponse } from 'next/server';
import { addRoomSignal } from '@/lib/db';
import { SignalType } from '@/types/tracker';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const signalTypes: SignalType[] = ['offer', 'answer', 'ice-candidate'];

export async function POST(request: Request) {
  try {
    const body: {
      roomId?: string;
      from?: string;
      to?: string;
      type?: SignalType;
      payload?: unknown;
    } = await request.json();

    if (!body.roomId || !body.from || !body.to || !body.type || !signalTypes.includes(body.type)) {
      return NextResponse.json({ error: 'Invalid signal request' }, { status: 400 });
    }

    const signal = addRoomSignal(body.roomId, body.from, body.to, body.type, body.payload);
    if (!signal) {
      return NextResponse.json({ error: 'Room or participant not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, signalId: signal.id });
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}
