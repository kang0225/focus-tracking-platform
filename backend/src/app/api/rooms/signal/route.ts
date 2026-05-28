import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import * as roomsRepo from '@/db/repositories/rooms';
import * as redis from '@/db/redis';
import { streamIdToSequence } from '@/lib/roomSerializer';
import type { SignalType } from '@/types/tracker';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const signalTypes: SignalType[] = ['offer', 'answer', 'ice-candidate'];

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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

    // 본인이 방 참가자인지 확인 (signal sender 권한)
    const room = await roomsRepo.getRoomWithMembers(body.roomId);
    if (!room) {
      return NextResponse.json({ error: 'Room not found' }, { status: 404 });
    }
    const isMember = room.participants.some(
      (p) => p.userId === session.user.id && p.leftAt === null,
    );
    if (!isMember) {
      return NextResponse.json({ error: 'Not a member' }, { status: 403 });
    }

    const streamId = await redis.pushSignal(body.roomId, {
      from: body.from,
      to: body.to,
      type: body.type,
      payload: body.payload,
    });

    return NextResponse.json({ success: true, signalId: streamIdToSequence(streamId) });
  } catch (err) {
    console.error('[rooms/signal] failed:', err);
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}
