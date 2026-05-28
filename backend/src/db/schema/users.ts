import { pgTable, uuid, text, timestamp, index } from 'drizzle-orm/pg-core';

/**
 * Google OIDC 계정 단위 사용자.
 * - google_sub 가 정체성의 단일 진입점
 * - id (uuid) 는 내부 PK 로만 사용 — 추후 식별자 추가 여지를 남김
 */
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    googleSub: text('google_sub').notNull().unique(),
    email: text('email').unique(),
    name: text('name').notNull(),
    avatarUrl: text('avatar_url'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  },
  (t) => [
    index('users_email_idx').on(t.email),
  ],
);

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;
