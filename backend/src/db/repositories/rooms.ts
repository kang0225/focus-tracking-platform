import { and, eq, isNull, sql } from 'drizzle-orm';
import { randomInt } from 'crypto';
import { db } from '../client';
import {
  rooms,
  roomParticipants,
  type RoomRow,
  type RoomParticipantRow,
} from '../schema/rooms';

const ROOM_CAPACITY = 5;
const INVITE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const INVITE_LENGTH = 6;

function makeRoomId(): string {
  return `ROOM-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function makeInviteCode(): string {
  let out = '';
  for (let i = 0; i < INVITE_LENGTH; i += 1) {
    out += INVITE_CHARS[randomInt(INVITE_CHARS.length)];
  }
  return out;
}

export function normalizeInviteCode(input: string): string {
  return input.trim().replace(/\s+/g, '').toUpperCase();
}

export interface RoomWithMembers {
  room: RoomRow;
  participants: RoomParticipantRow[];
}

export async function getRoomWithMembers(roomId: string): Promise<RoomWithMembers | null> {
  const roomRows = await db.select().from(rooms).where(eq(rooms.id, roomId)).limit(1);
  const room = roomRows[0];
  if (!room) return null;

  const memberRows = await db
    .select()
    .from(roomParticipants)
    .where(and(eq(roomParticipants.roomId, roomId), isNull(roomParticipants.leftAt)));

  return { room, participants: memberRows };
}

/**
 * 빈자리 있는 public 방을 찾아 join. 없으면 새로 생성.
 * 한 사용자가 활성 참여 중인 방이 있으면 그 방을 반환.
 */
export async function matchPublicRoom(input: {
  userId: string;
  displayName: string;
}): Promise<RoomWithMembers> {
  // 이미 어딘가에 들어가 있나
  const existing = await findActiveRoomForUser(input.userId);
  if (existing) {
    await touchParticipant(existing.room.id, input.userId, input.displayName);
    return (await getRoomWithMembers(existing.room.id))!;
  }

  // 자리 남는 public 룸 검색 (간단 구현: 모든 public 가져와서 count)
  const publicRooms = await db
    .select()
    .from(rooms)
    .where(and(eq(rooms.type, 'public'), isNull(rooms.closedAt)));

  for (const room of publicRooms) {
    const count = await countActiveParticipants(room.id);
    if (count < (room.maxParticipants ?? ROOM_CAPACITY)) {
      await joinRoom(room.id, input.userId, input.displayName);
      return (await getRoomWithMembers(room.id))!;
    }
  }

  // 새로 생성
  const newRoom = await createRoom({
    type: 'public',
    createdBy: input.userId,
  });
  await joinRoom(newRoom.id, input.userId, input.displayName);
  return (await getRoomWithMembers(newRoom.id))!;
}

export async function createInviteRoom(input: {
  userId: string;
  displayName: string;
}): Promise<RoomWithMembers> {
  const existing = await findActiveRoomForUser(input.userId);
  if (existing) {
    await touchParticipant(existing.room.id, input.userId, input.displayName);
    return (await getRoomWithMembers(existing.room.id))!;
  }

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const inviteCode = makeInviteCode();
    const id = `INVITE-${inviteCode}`;
    const inserted = await db
      .insert(rooms)
      .values({
        id,
        type: 'invite',
        inviteCode,
        createdBy: input.userId,
      })
      .onConflictDoNothing({ target: rooms.id })
      .returning();
    if (inserted[0]) {
      await joinRoom(inserted[0].id, input.userId, input.displayName);
      return (await getRoomWithMembers(inserted[0].id))!;
    }
  }
  throw new Error('Failed to generate a unique invite code after 8 attempts.');
}

export type JoinInviteResult =
  | { status: 'joined'; room: RoomWithMembers }
  | { status: 'not-found' }
  | { status: 'full' };

export async function joinInviteRoom(input: {
  inviteCode: string;
  userId: string;
  displayName: string;
}): Promise<JoinInviteResult> {
  const existing = await findActiveRoomForUser(input.userId);
  if (existing) {
    await touchParticipant(existing.room.id, input.userId, input.displayName);
    return { status: 'joined', room: (await getRoomWithMembers(existing.room.id))! };
  }

  const code = normalizeInviteCode(input.inviteCode);
  const roomRows = await db
    .select()
    .from(rooms)
    .where(and(eq(rooms.type, 'invite'), eq(rooms.inviteCode, code), isNull(rooms.closedAt)))
    .limit(1);
  const room = roomRows[0];
  if (!room) return { status: 'not-found' };

  const count = await countActiveParticipants(room.id);
  if (count >= (room.maxParticipants ?? ROOM_CAPACITY)) return { status: 'full' };

  await joinRoom(room.id, input.userId, input.displayName);
  return { status: 'joined', room: (await getRoomWithMembers(room.id))! };
}

async function createRoom(input: {
  type: 'public' | 'invite';
  createdBy: string;
  inviteCode?: string;
}): Promise<RoomRow> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const id = makeRoomId();
    const inserted = await db
      .insert(rooms)
      .values({
        id,
        type: input.type,
        inviteCode: input.inviteCode,
        createdBy: input.createdBy,
      })
      .onConflictDoNothing({ target: rooms.id })
      .returning();
    if (inserted[0]) return inserted[0];
  }
  throw new Error('Failed to generate a unique room id after 8 attempts.');
}

async function countActiveParticipants(roomId: string): Promise<number> {
  const result = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(roomParticipants)
    .where(and(eq(roomParticipants.roomId, roomId), isNull(roomParticipants.leftAt)));
  return result[0]?.count ?? 0;
}

async function joinRoom(roomId: string, userId: string, displayName: string): Promise<void> {
  // unique partial idx (room_id, user_id) WHERE left_at IS NULL — 중복 join 방지.
  // 동일 사용자의 기존 left_at 있는 행과는 충돌하지 않음.
  await db
    .insert(roomParticipants)
    .values({
      roomId,
      userId,
      displayName,
    })
    .onConflictDoNothing();
}

async function touchParticipant(
  roomId: string,
  userId: string,
  displayName: string,
): Promise<void> {
  await db
    .update(roomParticipants)
    .set({ lastSeenAt: new Date(), displayName })
    .where(
      and(
        eq(roomParticipants.roomId, roomId),
        eq(roomParticipants.userId, userId),
        isNull(roomParticipants.leftAt),
      ),
    );
}

export async function heartbeatParticipant(roomId: string, userId: string): Promise<void> {
  await db
    .update(roomParticipants)
    .set({ lastSeenAt: new Date() })
    .where(
      and(
        eq(roomParticipants.roomId, roomId),
        eq(roomParticipants.userId, userId),
        isNull(roomParticipants.leftAt),
      ),
    );
}

export async function leaveRoom(roomId: string, userId: string): Promise<boolean> {
  const rows = await db
    .update(roomParticipants)
    .set({ leftAt: new Date() })
    .where(
      and(
        eq(roomParticipants.roomId, roomId),
        eq(roomParticipants.userId, userId),
        isNull(roomParticipants.leftAt),
      ),
    )
    .returning({ id: roomParticipants.id });

  // 마지막 사람이 나가면 방 close
  const remaining = await countActiveParticipants(roomId);
  if (remaining === 0) {
    await db.update(rooms).set({ closedAt: new Date() }).where(eq(rooms.id, roomId));
  }

  return rows.length > 0;
}

export async function findActiveRoomForUser(userId: string): Promise<RoomWithMembers | null> {
  const rows = await db
    .select({ roomId: roomParticipants.roomId })
    .from(roomParticipants)
    .where(and(eq(roomParticipants.userId, userId), isNull(roomParticipants.leftAt)))
    .limit(1);
  if (!rows[0]) return null;
  return getRoomWithMembers(rows[0].roomId);
}

/**
 * lastSeenAt 이 staleMs 보다 오래된 참가자를 강제 leave 처리.
 * 기존 in-memory cleanupVideoRooms 대체.
 */
export async function reapStaleParticipants(staleMs: number = 120_000): Promise<number> {
  const cutoff = new Date(Date.now() - staleMs);
  const rows = await db
    .update(roomParticipants)
    .set({ leftAt: new Date() })
    .where(
      and(
        isNull(roomParticipants.leftAt),
        sql`${roomParticipants.lastSeenAt} < ${cutoff}`,
      ),
    )
    .returning({ id: roomParticipants.id });
  return rows.length;
}
