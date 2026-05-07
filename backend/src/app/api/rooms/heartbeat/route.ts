import { NextResponse } from 'next/server';
import { updateRoomParticipant } from '@/lib/db';
import { FocusMetrics, ParticipantMediaState } from '@/types/tracker';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body: {
      roomId?: string;
      clientId?: string;
      name?: string;
      metrics?: Partial<FocusMetrics>;
      media?: Partial<ParticipantMediaState>;
    } = await request.json();

    if (!body.roomId || !body.clientId) {
      return NextResponse.json({ error: 'roomId and clientId are required' }, { status: 400 });
    }

    const room = updateRoomParticipant(body.roomId, body.clientId, body.metrics, body.media, body.name);
    if (!room) {
      return NextResponse.json({ error: 'Room or participant not found' }, { status: 404 });
    }

    return NextResponse.json(room);
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}
