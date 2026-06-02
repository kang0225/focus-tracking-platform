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
      roomId?: string;
      clientId?: string;
      name?: string;
      metrics?: Partial<FocusMetrics>;
      media?: Partial<ParticipantMediaState>;
    } = await request.json();

    if (!body.roomId) {
      return NextResponse.json({ error: 'roomId is required' }, { status: 400 });
    }

    // DB: lastSeenAt 갱신
    await roomsRepo.heartbeatParticipant(body.roomId, session.user.id);

    // Redis: presence 갱신
    const displayName = body.name ?? session.user.name ?? '사용자';
    await redis.setPresence(body.roomId, session.user.id, {
      displayName,
      audioEnabled: body.media?.audioEnabled ?? true,
      videoEnabled: body.media?.videoEnabled ?? true,
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

    const room = await roomsRepo.getRoomWithMembers(body.roomId);
    if (!room) {
      return NextResponse.json({ error: 'Room not found' }, { status: 404 });
    }

    return NextResponse.json(await snapshotRoom(room));
  } catch (err) {
    console.error('[rooms/heartbeat] failed:', err);
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}
