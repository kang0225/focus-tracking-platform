import { pgTable, uuid, text, timestamp, real, index } from 'drizzle-orm/pg-core';

/**
 * Google OIDC 계정 단위 사용자.
 * - google_sub 가 정체성의 단일 진입점
 * - id (uuid) 는 내부 PK 로만 사용 — 추후 식별자 추가 여지를 남김
 * - 대시보드 사용자 설정 (daily_goal_hours / dday_* / daily_motto) 동거
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

    // 메인 대시보드 사용자 설정 (브라우저 종속 X, 모든 디바이스 공유)
    dailyGoalHours: real('daily_goal_hours').notNull().default(4),
    ddayDate: text('dday_date'),       // "YYYY-MM-DD" 또는 null
    ddayLabel: text('dday_label'),     // 예: "2026 수능"
    dailyMotto: text('daily_motto'),   // 한 줄 각오 (≤ 200자)
  },
  (t) => [
    index('users_email_idx').on(t.email),
  ],
);

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;
