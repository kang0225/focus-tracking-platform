import { NextResponse } from 'next/server';
import { createInviteVideoRoom, joinInviteVideoRoom, updateRoomParticipant } from '@/lib/db';
import { FocusMetrics, ParticipantMediaState } from '@/types/tracker';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body: {
      action?: 'create' | 'join';
      clientId?: string;
      inviteCode?: string;
      name?: string;
      metrics?: Partial<FocusMetrics>;
      media?: Partial<ParticipantMediaState>;
    } = await request.json();

    if (!body.clientId) {
      return NextResponse.json({ error: 'clientId is required' }, { status: 400 });
    }

    if (body.action === 'create') {
      const room = createInviteVideoRoom(body.clientId, body.name ?? '', body.media);
      if (body.metrics || body.media) {
        const updated = updateRoomParticipant(room.roomId, body.clientId, body.metrics, body.media, body.name);
        return NextResponse.json(updated ?? room);
      }

      return NextResponse.json(room);
    }

    if (body.action === 'join') {
      if (!body.inviteCode?.trim()) {
        return NextResponse.json({ error: '초대코드를 입력해주세요.' }, { status: 400 });
      }

      const result = joinInviteVideoRoom(body.inviteCode, body.clientId, body.name ?? '', body.media);
      if (result.status === 'not-found') {
        return NextResponse.json({ error: '존재하지 않거나 만료된 초대코드입니다.' }, { status: 404 });
      }
      if (result.status === 'full') {
        return NextResponse.json({ error: '초대코드 방이 가득 찼습니다.' }, { status: 409 });
      }

      if (body.metrics || body.media) {
        const updated = updateRoomParticipant(result.room.roomId, body.clientId, body.metrics, body.media, body.name);
        return NextResponse.json(updated ?? result.room);
      }

      return NextResponse.json(result.room);
    }

    return NextResponse.json({ error: 'action must be create or join' }, { status: 400 });
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}
