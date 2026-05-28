import { createHash, randomBytes } from 'crypto';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { db } from '../client';
import { sessions, type SessionRow } from '../schema/sessions';
import { users, type UserRow } from '../schema/users';

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;

function hashToken(token: string): Buffer {
  return createHash('sha256').update(token).digest();
}

export function generateSessionToken(): string {
  // 쿠키에 들어갈 raw token. URL-safe base64.
  return randomBytes(32).toString('base64url');
}

export interface CreatedSession {
  session: SessionRow;
  rawToken: string;
}

export async function createSession(input: {
  userId: string;
  userAgent?: string | null;
  ip?: string | null;
  ttlMs?: number;
}): Promise<CreatedSession> {
  const rawToken = generateSessionToken();
  const ttl = input.ttlMs ?? SESSION_TTL_MS;

  const rows = await db
    .insert(sessions)
    .values({
      userId: input.userId,
      tokenHash: hashToken(rawToken),
      userAgent: input.userAgent ?? null,
      ip: input.ip ?? null,
      expiresAt: new Date(Date.now() + ttl),
    })
    .returning();

  return { session: rows[0], rawToken };
}

export interface ResolvedSession {
  session: SessionRow;
  user: UserRow;
}

/**
 * 쿠키의 raw token 으로 세션 + 사용자를 동시 조회.
 * - revoked_at IS NULL
 * - expires_at > now()
 * 호출 시점에 last_used_at 갱신.
 */
export async function resolveSession(rawToken: string): Promise<ResolvedSession | null> {
  if (!rawToken) return null;

  const rows = await db
    .select({
      session: sessions,
      user: users,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(
      and(
        eq(sessions.tokenHash, hashToken(rawToken)),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, new Date()),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  await db
    .update(sessions)
    .set({ lastUsedAt: new Date() })
    .where(eq(sessions.id, row.session.id));

  return { session: row.session, user: row.user };
}

export async function revokeSession(rawToken: string): Promise<void> {
  if (!rawToken) return;
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.tokenHash, hashToken(rawToken)), isNull(sessions.revokedAt)));
}

export async function revokeAllUserSessions(userId: string): Promise<void> {
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
}

export async function purgeExpiredSessions(): Promise<number> {
  const rows = await db
    .delete(sessions)
    .where(sql`${sessions.expiresAt} < now()`)
    .returning({ id: sessions.id });
  return rows.length;
}
