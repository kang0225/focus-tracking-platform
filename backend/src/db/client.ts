import { Pool } from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from './schema';

/**
 * 단일 pg Pool 을 프로세스 전역에서 재사용.
 * Next.js HMR 환경에서 모듈이 재로드되며 pool 이 누적되는 것을 막기 위해
 * globalThis 에 한 번만 캐시한다.
 */
declare global {
  // eslint-disable-next-line no-var
  var __focusPgPool: Pool | undefined;
  // eslint-disable-next-line no-var
  var __focusDrizzle: NodePgDatabase<typeof schema> | undefined;
}

function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. See backend/.env.example for the expected format.',
    );
  }
  return url;
}

function createPool(): Pool {
  const max = Number(process.env.DATABASE_POOL_MAX ?? 10);
  const idleTimeoutMillis = Number(process.env.DATABASE_POOL_IDLE_MS ?? 30_000);

  const pool = new Pool({
    connectionString: getDatabaseUrl(),
    max: Number.isFinite(max) ? max : 10,
    idleTimeoutMillis: Number.isFinite(idleTimeoutMillis) ? idleTimeoutMillis : 30_000,
    // RDS 는 sslmode=require 를 connection string 으로 받지만, pg 가 그것을 강제로
    // CA 검증까지 요구하므로 운영에선 별도 ssl 옵션을 켜는 것이 안전.
    ssl:
      process.env.NODE_ENV === 'production'
        ? { rejectUnauthorized: false }
        : undefined,
  });

  pool.on('error', (err) => {
    // idle client 에서 발생한 에러는 throw 하면 프로세스가 죽으므로 로깅만.
    console.error('[db] idle pg client error:', err);
  });

  return pool;
}

export const pgPool: Pool = globalThis.__focusPgPool ?? (globalThis.__focusPgPool = createPool());

export const db: NodePgDatabase<typeof schema> =
  globalThis.__focusDrizzle ?? (globalThis.__focusDrizzle = drizzle(pgPool, { schema }));

export { schema };
