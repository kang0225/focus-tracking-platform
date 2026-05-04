import { NextResponse } from 'next/server';
import { leaveVideoRoom } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body: { roomId?: string; clientId?: string } = await request.json();
    if (!body.roomId || !body.clientId) {
      return NextResponse.json({ error: 'roomId and clientId are required' }, { status: 400 });
    }

    leaveVideoRoom(body.roomId, body.clientId);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}
