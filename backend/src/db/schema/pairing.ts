import { pgTable, uuid, text, timestamp, index } from 'drizzle-orm/pg-core';
import { users } from './users';
import { devices } from './devices';

/**
 * PC ↔ Phone 페어링 코드. 발급 후 짧은 TTL.
 * issuer = 코드를 발행한 쪽 (보통 PC), claimed_by = 코드를 입력한 쪽 (보통 Phone).
 */
export const pairingCodes = pgTable(
  'pairing_codes',
  {
    code: text('code').primaryKey(),
    issuerUserId: uuid('issuer_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    issuerDeviceId: uuid('issuer_device_id').references(() => devices.id, {
      onDelete: 'set null',
    }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    claimedByUserId: uuid('claimed_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    claimedByDeviceId: uuid('claimed_by_device_id').references(() => devices.id, {
      onDelete: 'set null',
    }),
    claimedAt: timestamp('claimed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('pairing_codes_issuer_idx').on(t.issuerUserId),
    index('pairing_codes_expires_at_idx').on(t.expiresAt),
  ],
);

/**
 * 현재 살아있는 사용자별 PC ↔ Phone 매핑.
 * PK 가 user_id 단일 → 사용자당 활성 페어링 1개.
 * 같은 user_id 로 어디서 접속해도 동일 페어링이 보임 → 멀티-디바이스 일관성.
 */
export const activePairings = pgTable(
  'active_pairings',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    pcDeviceId: uuid('pc_device_id').references(() => devices.id, {
      onDelete: 'set null',
    }),
    phoneDeviceId: uuid('phone_device_id').references(() => devices.id, {
      onDelete: 'set null',
    }),
    appleWatchPaired: text('apple_watch_paired'),
    establishedAt: timestamp('established_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
);

export type PairingCodeRow = typeof pairingCodes.$inferSelect;
export type NewPairingCodeRow = typeof pairingCodes.$inferInsert;
export type ActivePairingRow = typeof activePairings.$inferSelect;
export type NewActivePairingRow = typeof activePairings.$inferInsert;
