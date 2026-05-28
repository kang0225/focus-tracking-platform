import { eq, sql } from 'drizzle-orm';
import { db } from '../client';
import { users, type NewUserRow, type UserRow } from '../schema/users';

export async function findUserById(id: string): Promise<UserRow | null> {
  const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function findUserByGoogleSub(googleSub: string): Promise<UserRow | null> {
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.googleSub, googleSub))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Google OAuth callback 에서 사용. 동일 google_sub 가 이미 있으면
 * 프로필 정보만 갱신하고 동일 행을 반환 (upsert).
 */
export async function upsertGoogleUser(input: {
  googleSub: string;
  email: string | null;
  name: string;
  avatarUrl: string | null;
}): Promise<UserRow> {
  const insertValues: NewUserRow = {
    googleSub: input.googleSub,
    email: input.email,
    name: input.name,
    avatarUrl: input.avatarUrl,
    lastLoginAt: new Date(),
  };

  const rows = await db
    .insert(users)
    .values(insertValues)
    .onConflictDoUpdate({
      target: users.googleSub,
      set: {
        email: input.email,
        name: input.name,
        avatarUrl: input.avatarUrl,
        lastLoginAt: new Date(),
        updatedAt: sql`now()`,
      },
    })
    .returning();

  return rows[0];
}

export async function touchUserLogin(id: string): Promise<void> {
  await db
    .update(users)
    .set({ lastLoginAt: new Date(), updatedAt: sql`now()` })
    .where(eq(users.id, id));
}

// ────────────────────────────────────────────────────────────
// 사용자 설정 (메인 대시보드 — 목표 / D-DAY / 각오)
// ────────────────────────────────────────────────────────────

export interface UserSettings {
  dailyGoalHours: number;
  ddayDate: string | null;     // "YYYY-MM-DD"
  ddayLabel: string | null;
  dailyMotto: string | null;
}

export async function getUserSettings(userId: string): Promise<UserSettings> {
  const rows = await db
    .select({
      dailyGoalHours: users.dailyGoalHours,
      ddayDate: users.ddayDate,
      ddayLabel: users.ddayLabel,
      dailyMotto: users.dailyMotto,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const row = rows[0];
  return {
    dailyGoalHours: row?.dailyGoalHours ?? 4,
    ddayDate: row?.ddayDate ?? null,
    ddayLabel: row?.ddayLabel ?? null,
    dailyMotto: row?.dailyMotto ?? null,
  };
}

export async function updateUserSettings(
  userId: string,
  patch: Partial<UserSettings>,
): Promise<UserSettings> {
  // 빈 값 / undefined 는 skip 해서 부분 갱신만.
  const updateValues: Record<string, unknown> = { updatedAt: sql`now()` };

  if (patch.dailyGoalHours != null) {
    updateValues.dailyGoalHours = Math.max(0.5, Math.min(24, patch.dailyGoalHours));
  }
  if (patch.ddayDate !== undefined) {
    // 빈 문자열은 null 로 정규화.
    updateValues.ddayDate = patch.ddayDate && patch.ddayDate.length > 0 ? patch.ddayDate : null;
  }
  if (patch.ddayLabel !== undefined) {
    updateValues.ddayLabel = patch.ddayLabel && patch.ddayLabel.length > 0
      ? patch.ddayLabel.slice(0, 60)
      : null;
  }
  if (patch.dailyMotto !== undefined) {
    updateValues.dailyMotto = patch.dailyMotto && patch.dailyMotto.length > 0
      ? patch.dailyMotto.slice(0, 200)
      : null;
  }

  await db.update(users).set(updateValues).where(eq(users.id, userId));
  return getUserSettings(userId);
}
