import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import * as roomsRepo from '@/db/repositories/rooms';
import * as redis from '@/db/redis';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: { roomId?: string; clientId?: string } = await request.json();
    if (!body.roomId) {
      return NextResponse.json({ error: 'roomId is required' }, { status: 400 });
    }

    await roomsRepo.leaveRoom(body.roomId, session.user.id);
    await redis.dropPresence(body.roomId, session.user.id);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[rooms/leave] failed:', err);
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}
