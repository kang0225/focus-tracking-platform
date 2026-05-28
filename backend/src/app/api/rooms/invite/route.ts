import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import * as roomsRepo from '@/db/repositories/rooms';
import * as redis from '@/db/redis';
import { snapshotRoom } from '@/lib/roomSerializer';
import type { FocusMetrics, ParticipantMediaState } from '@/types/tracker';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: {
      action?: 'create' | 'join';
      clientId?: string;
      inviteCode?: string;
      name?: string;
      metrics?: Partial<FocusMetrics>;
      media?: Partial<ParticipantMediaState>;
    } = await request.json();

    const displayName = body.name ?? session.user.name ?? '사용자';
    const audioEnabled = body.media?.audioEnabled ?? true;
    const videoEnabled = body.media?.videoEnabled ?? true;

    const touchPresence = async (roomId: string) => {
      await redis.setPresence(roomId, session.user.id, {
        displayName,
        audioEnabled,
        videoEnabled,
        lastSeenAt: Date.now(),
      });
      if (body.metrics) {
        await redis.setLiveMetrics(session.user.id, {
          gazeX: body.metrics.gazeX ?? 0,
          gazeY: body.metrics.gazeY ?? 0,
          heartRate: body.metrics.heartRate ?? 0,
          heartRateSource: body.metrics.heartRateSource ?? '대기 중',
          focusScore: body.metrics.focusScore ?? 0,
          focusSource: body.metrics.focusSource,
          focusThreshold: body.metrics.focusThreshold,
          focusIsFocused: body.metrics.focusIsFocused,
          updatedAt: Date.now(),
        });
      }
    };

    if (body.action === 'create') {
      const result = await roomsRepo.createInviteRoom({
        userId: session.user.id,
        displayName,
      });
      await touchPresence(result.room.id);
      return NextResponse.json(await snapshotRoom(result));
    }

    if (body.action === 'join') {
      if (!body.inviteCode?.trim()) {
        return NextResponse.json({ error: '초대코드를 입력해주세요.' }, { status: 400 });
      }

      const result = await roomsRepo.joinInviteRoom({
        inviteCode: body.inviteCode,
        userId: session.user.id,
        displayName,
      });
      if (result.status === 'not-found') {
        return NextResponse.json({ error: '존재하지 않거나 만료된 초대코드입니다.' }, { status: 404 });
      }
      if (result.status === 'full') {
        return NextResponse.json({ error: '초대코드 방이 가득 찼습니다.' }, { status: 409 });
      }

      await touchPresence(result.room.room.id);
      return NextResponse.json(await snapshotRoom(result.room));
    }

    return NextResponse.json({ error: 'action must be create or join' }, { status: 400 });
  } catch (err) {
    console.error('[rooms/invite] failed:', err);
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}
