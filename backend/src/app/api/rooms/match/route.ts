import { NextResponse } from 'next/server';
import { matchVideoRoom, updateRoomParticipant } from '@/lib/db';
import { FocusMetrics, ParticipantMediaState } from '@/types/tracker';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body: {
      clientId?: string;
      name?: string;
      metrics?: Partial<FocusMetrics>;
      media?: Partial<ParticipantMediaState>;
    } = await request.json();
    if (!body.clientId) {
      return NextResponse.json({ error: 'clientId is required' }, { status: 400 });
    }

    const room = matchVideoRoom(body.clientId, body.name ?? '', body.media);
    if (body.metrics || body.media) {
      const updated = updateRoomParticipant(room.roomId, body.clientId, body.metrics, body.media, body.name);
      return NextResponse.json(updated ?? room);
    }

    return NextResponse.json(room);
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}
