import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { resolve } from 'node:path';
import { getDb, getPgPool } from './client';

/**
 * pg advisory lock 의 임의 고정 ID. Multi-AZ 로 ECS task 가 동시에 부팅돼도
 * 한 명만 migrate 통과, 나머지는 대기. (32-bit signed 범위 내 고정값)
 */
const MIGRATION_LOCK_ID = 7340034;

/**
 * 컨테이너 부팅 시 1회 호출. instrumentation.ts 에서 entry.
 *
 * 동작:
 *   1. pg_advisory_lock 획득 (다른 task 가 잡고 있으면 block)
 *   2. drizzle-orm 의 migrate() 호출 — _journal.json 보고 미적용 SQL 만 실행
 *      (이미 다 적용된 상태면 50ms 안에 즉시 끝)
 *   3. pg_advisory_unlock + 클라이언트 release
 *
 * 실패 시 throw → instrumentation.register() 에서 propagate → 컨테이너 unhealthy.
 * ECS 가 재시작 / CodeDeploy 가 traffic shift 안 함 → 자동 롤백.
 */
export async function runMigrations(): Promise<void> {
  const startedAt = Date.now();
  const pool = getPgPool();

  // 락은 동일 connection 안에서만 보장되므로 명시적으로 client 잡아둔다.
  const client = await pool.connect();
  try {
    console.log('[migrate] acquiring advisory lock...');
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_ID]);
    console.log('[migrate] lock acquired, running migrations...');

    // migrationsFolder 는 CWD 기준 상대경로. Docker 컨테이너 WORKDIR=/app 이라
    // /app/src/db/migrations 로 resolve 됨. process.cwd() 로 명시해 의도 분명히.
    const migrationsFolder = resolve(process.cwd(), 'src/db/migrations');
    await migrate(getDb(), { migrationsFolder });

    const elapsed = Date.now() - startedAt;
    console.log(`[migrate] done in ${elapsed}ms (folder: ${migrationsFolder})`);
  } finally {
    try {
      await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_ID]);
    } catch (err) {
      console.error('[migrate] failed to release advisory lock:', err);
    }
    client.release();
  }
}
