import { pgTable, uuid, text, timestamp, pgEnum, index } from 'drizzle-orm/pg-core';
import { users } from './users';

export const deviceRoleEnum = pgEnum('device_role', ['pc', 'phone']);

/**
 * 사용자가 보유한 디바이스 (PC / Phone).
 * 한 사용자가 여러 PC, 여러 Phone 을 가질 수 있다.
 */
export const devices = pgTable(
  'devices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: deviceRoleEnum('role').notNull(),
    label: text('label'),
    userAgent: text('user_agent'),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('devices_user_id_idx').on(t.userId),
  ],
);

export type DeviceRow = typeof devices.$inferSelect;
export type NewDeviceRow = typeof devices.$inferInsert;
