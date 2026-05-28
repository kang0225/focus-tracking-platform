import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  pgEnum,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users';

export const roomTypeEnum = pgEnum('room_type', ['public', 'invite']);

/**
 * 비디오 룸. id 는 기존 코드와의 호환을 위해 text ("ROOM-XXXXXX" / "INVITE-XXXXXX").
 * invite_code 는 invite 룸에서만 사용.
 */
export const rooms = pgTable(
  'rooms',
  {
    id: text('id').primaryKey(),
    type: roomTypeEnum('type').notNull(),
    inviteCode: text('invite_code'),
    maxParticipants: integer('max_participants').notNull().default(5),
    createdBy: uuid('created_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp('closed_at', { withTimezone: true }),
  },
  (t) => [
    // invite_code 는 NULL 허용이지만 NOT NULL 인 행끼리는 unique 해야 함.
    uniqueIndex('rooms_invite_code_unique_idx')
      .on(t.inviteCode)
      .where(sql`${t.inviteCode} IS NOT NULL`),
    index('rooms_type_idx').on(t.type),
  ],
);

/**
 * 방 참가 이력. user_id 키로 잡혀있어 같은 사용자가 디바이스를 옮겨도 동일 인격으로 인식.
 * 활성 멤버십은 left_at IS NULL 인 행. unique partial index 로 중복 join 방지.
 */
export const roomParticipants = pgTable(
  'room_participants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    roomId: text('room_id')
      .notNull()
      .references(() => rooms.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    displayName: text('display_name').notNull(),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    leftAt: timestamp('left_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('room_participants_active_unique_idx')
      .on(t.roomId, t.userId)
      .where(sql`${t.leftAt} IS NULL`),
    index('room_participants_room_idx').on(t.roomId),
    index('room_participants_user_idx').on(t.userId),
  ],
);

export type RoomRow = typeof rooms.$inferSelect;
export type NewRoomRow = typeof rooms.$inferInsert;
export type RoomParticipantRow = typeof roomParticipants.$inferSelect;
export type NewRoomParticipantRow = typeof roomParticipants.$inferInsert;
