import { NextResponse } from 'next/server';
import { getRoomEvents } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const roomId = searchParams.get('roomId');
  const clientId = searchParams.get('clientId');
  const after = Number(searchParams.get('after') ?? 0);

  if (!roomId || !clientId) {
    return NextResponse.json({ error: 'roomId and clientId are required' }, { status: 400 });
  }

  const events = getRoomEvents(roomId, clientId, Number.isFinite(after) ? after : 0);
  if (!events) {
    return NextResponse.json({ error: 'Room or participant not found' }, { status: 404 });
  }

  return NextResponse.json(events);
}
