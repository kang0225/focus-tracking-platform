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
      clientId?: string;
      name?: string;
      metrics?: Partial<FocusMetrics>;
      media?: Partial<ParticipantMediaState>;
    } = await request.json();

    const displayName = body.name ?? session.user.name ?? '사용자';
    const result = await roomsRepo.matchPublicRoom({
      userId: session.user.id,
      displayName,
    });

    // Redis presence 갱신 (라이브 표시 + heartbeat 용)
    await redis.setPresence(result.room.id, session.user.id, {
      displayName,
      audioEnabled: body.media?.audioEnabled ?? true,
      videoEnabled: body.media?.videoEnabled ?? true,
      lastSeenAt: Date.now(),
    });

    // metrics 가 같이 오면 live metrics 도 갱신
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

    const snapshot = await snapshotRoom(result);
    return NextResponse.json(snapshot);
  } catch (err) {
    console.error('[rooms/match] failed:', err);
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}
