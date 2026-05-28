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
