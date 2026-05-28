import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import * as roomsRepo from '@/db/repositories/rooms';
import * as redis from '@/db/redis';
import { snapshotRoom, sequenceToStreamId, mapSignal } from '@/lib/roomSerializer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const roomId = searchParams.get('roomId');
  const clientId = searchParams.get('clientId');
  const afterSeq = Number(searchParams.get('after') ?? 0);

  if (!roomId || !clientId) {
    return NextResponse.json({ error: 'roomId and clientId are required' }, { status: 400 });
  }

  const result = await roomsRepo.getRoomWithMembers(roomId);
  if (!result) {
    return NextResponse.json({ error: 'Room not found' }, { status: 404 });
  }

  // 본인이 방 참가자인지 확인
  const isMember = result.participants.some(
    (p) => p.userId === session.user.id && p.leftAt === null,
  );
  if (!isMember) {
    return NextResponse.json({ error: 'Not a member' }, { status: 403 });
  }

  // heartbeat 효과: lastSeenAt 갱신
  await roomsRepo.heartbeatParticipant(roomId, session.user.id);

  // Redis stream 에서 본인 clientId 로 온 signals 만 (afterSeq 이후)
  const afterStreamId = Number.isFinite(afterSeq) && afterSeq > 0
    ? sequenceToStreamId(afterSeq)
    : null;
  const signalEntries = await redis.readSignalsFor(roomId, clientId, afterStreamId);

  const snapshot = await snapshotRoom(result);
  const signals = signalEntries.map((entry) => ({
    ...mapSignal(entry),
    roomId,
  }));

  return NextResponse.json({ room: snapshot, signals });
}
