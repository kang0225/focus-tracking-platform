import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { randomInt } from 'crypto';
import { db } from '../client';
import {
  pairingCodes,
  activePairings,
  type PairingCodeRow,
  type ActivePairingRow,
} from '../schema/pairing';

// 페어링 코드 TTL — 사용자가 한참 측정해도 안 끊기게 24시간.
// 짧게 가져가면 측정 도중 Apple Watch 연결이 끊겨버려 UX 손상.
const PAIRING_TTL_MS = 1000 * 60 * 60 * 24;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

function makeCode(): string {
  let out = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    out += CODE_CHARS[randomInt(CODE_CHARS.length)];
  }
  return out;
}

export function normalizePairingCode(input: string): string {
  return input.trim().replace(/\s+/g, '').toUpperCase();
}

/**
 * PC 쪽에서 페어링 코드 발급. 같은 사용자가 발급한 미사용/유효 코드가 있으면 재사용.
 */
export async function issuePairingCode(input: {
  issuerUserId: string;
  issuerDeviceId?: string | null;
  ttlMs?: number;
}): Promise<PairingCodeRow> {
  const ttl = input.ttlMs ?? PAIRING_TTL_MS;
  const expiresAt = new Date(Date.now() + ttl);

  // 충돌 회피 — 같은 code 가 있으면 다시 시도. PK 충돌 시 ON CONFLICT DO NOTHING.
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = makeCode();
    const inserted = await db
      .insert(pairingCodes)
      .values({
        code,
        issuerUserId: input.issuerUserId,
        issuerDeviceId: input.issuerDeviceId ?? null,
        expiresAt,
      })
      .onConflictDoNothing({ target: pairingCodes.code })
      .returning();
    if (inserted[0]) return inserted[0];
  }
  throw new Error('Failed to generate a unique pairing code after 8 attempts.');
}

export async function findActiveCode(code: string): Promise<PairingCodeRow | null> {
  const rows = await db
    .select()
    .from(pairingCodes)
    .where(
      and(
        eq(pairingCodes.code, normalizePairingCode(code)),
        gt(pairingCodes.expiresAt, new Date()),
        isNull(pairingCodes.claimedAt),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

/**
 * 페어링 코드 row 조회 — claim 여부 무관.
 * Apple Watch (heartrate route) 처럼 코드로 issuer_user_id 만 알아내면 되는 케이스용.
 * expires_at 이 지나면 null.
 */
export async function findPairingCodeById(code: string): Promise<PairingCodeRow | null> {
  const rows = await db
    .select()
    .from(pairingCodes)
    .where(
      and(
        eq(pairingCodes.code, normalizePairingCode(code)),
        gt(pairingCodes.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Phone 쪽이 코드를 입력하면 호출. atomic 하게 claimed_at 을 채우고
 * active_pairings 를 upsert.
 */
export async function claimPairingCode(input: {
  code: string;
  claimerUserId: string;
  claimerDeviceId?: string | null;
}): Promise<{ pairing: ActivePairingRow; code: PairingCodeRow } | null> {
  const normalized = normalizePairingCode(input.code);

  const claimedRows = await db
    .update(pairingCodes)
    .set({
      claimedByUserId: input.claimerUserId,
      claimedByDeviceId: input.claimerDeviceId ?? null,
      claimedAt: new Date(),
    })
    .where(
      and(
        eq(pairingCodes.code, normalized),
        gt(pairingCodes.expiresAt, new Date()),
        isNull(pairingCodes.claimedAt),
      ),
    )
    .returning();

  const claimed = claimedRows[0];
  if (!claimed) return null;

  const pairingRows = await db
    .insert(activePairings)
    .values({
      userId: claimed.issuerUserId,
      pcDeviceId: claimed.issuerDeviceId,
      phoneDeviceId: input.claimerDeviceId ?? null,
    })
    .onConflictDoUpdate({
      target: activePairings.userId,
      set: {
        pcDeviceId: claimed.issuerDeviceId,
        phoneDeviceId: input.claimerDeviceId ?? null,
        updatedAt: sql`now()`,
      },
    })
    .returning();

  return { pairing: pairingRows[0], code: claimed };
}

export async function getActivePairing(userId: string): Promise<ActivePairingRow | null> {
  const rows = await db
    .select()
    .from(activePairings)
    .where(eq(activePairings.userId, userId))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * heartrate route 가 Apple Watch 메트릭 첫 수신 시 호출. active_pairings 의
 * apple_watch_paired 컬럼을 갱신 (이미 행이 있어야 의미 있음).
 */
export async function markApplePaired(userId: string): Promise<void> {
  await db
    .update(activePairings)
    .set({ appleWatchPaired: 'true', updatedAt: sql`now()` })
    .where(eq(activePairings.userId, userId));
}

export async function clearActivePairing(userId: string): Promise<void> {
  await db.delete(activePairings).where(eq(activePairings.userId, userId));
}

export async function purgeExpiredPairingCodes(): Promise<number> {
  const rows = await db
    .delete(pairingCodes)
    .where(sql`${pairingCodes.expiresAt} < now()`)
    .returning({ code: pairingCodes.code });
  return rows.length;
}
