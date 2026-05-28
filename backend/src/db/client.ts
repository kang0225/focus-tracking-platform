import { Pool } from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from './schema';

/**
 * 단일 pg Pool 을 프로세스 전역에서 재사용.
 *
 * 두 가지 설계 포인트:
 *
 * 1) **Lazy 초기화** — module import 시점이 아니라 첫 쿼리 시점에 Pool 생성.
 *    `db` 는 Proxy 로 감싸서 `import { db }` 자체로는 환경변수를 읽지 않음.
 *    → `next build` 시점에 DATABASE_URL 없어도 빌드 안 깨짐.
 *
 * 2) **HMR-safe globalThis 캐시** — Next.js dev 모드에서 모듈이 재로드되며
 *    Pool 이 누적되는 것을 막기 위해 globalThis 에 한 번만 캐시.
 *
 * 3) **운영 (ECS) 환경변수 fallback** — Terraform 13_ecs.tf 가 박는
 *    DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME 를 그대로 받을 수 있게,
 *    DATABASE_URL 이 없으면 분해형 환경변수에서 URL 을 조립한다.
 *    → 인프라/secret 추가 변경 없이 그대로 RDS 와 연결.
 */
declare global {
  // eslint-disable-next-line no-var
  var __focusPgPool: Pool | undefined;
  // eslint-disable-next-line no-var
  var __focusDrizzle: NodePgDatabase<typeof schema> | undefined;
}

function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL?.trim();
  if (url) return url;

  // ECS / Terraform 13_ecs.tf 가 박는 분해형 환경변수 fallback.
  const host = process.env.DB_HOST?.trim();
  const port = process.env.DB_PORT?.trim() ?? '5432';
  const user = process.env.DB_USER?.trim();
  const password = process.env.DB_PASSWORD ?? '';
  const dbName = process.env.DB_NAME?.trim();

  if (host && user && dbName) {
    const encodedUser = encodeURIComponent(user);
    const encodedPass = encodeURIComponent(password);
    // SSL 은 connectionString 의 ?sslmode 가 아니라 아래 Pool 의 ssl 옵션 한 군데에서만
    // 제어한다. 양쪽에 두면 pg 가 둘을 충돌시켜 cert 검증이 의도와 달리 재활성화되는
    // 경우가 있어 "self-signed cert in chain" 에러가 남.
    return `postgres://${encodedUser}:${encodedPass}@${host}:${port}/${dbName}`;
  }

  throw new Error(
    'Postgres connection is not configured. Set DATABASE_URL, ' +
      'or DB_HOST + DB_USER + DB_PASSWORD + DB_NAME (see backend/.env.example).',
  );
}

function createPool(): Pool {
  const max = Number(process.env.DATABASE_POOL_MAX ?? 10);
  const idleTimeoutMillis = Number(process.env.DATABASE_POOL_IDLE_MS ?? 30_000);

  const pool = new Pool({
    connectionString: getDatabaseUrl(),
    max: Number.isFinite(max) ? max : 10,
    idleTimeoutMillis: Number.isFinite(idleTimeoutMillis) ? idleTimeoutMillis : 30_000,
    // production: TLS 강제 + CA 검증은 건너뜀. AWS RDS 가 자체 CA 로 서명한 인증서를
    // 쓰는데 Node 의 기본 신뢰 저장소에 그 CA 가 없어서 "self-signed cert in chain"
    // 에러가 남. truthy 한 ssl 객체를 넘기면 pg 가 자동으로 SSL 을 켜고,
    // rejectUnauthorized: false 로 CA 검증만 끔. 트래픽 자체는 그대로 암호화되며
    // VPC 프라이빗 서브넷 + db_sg 로 접근 제어는 별도로 되어 있다.
    // CA 검증까지 원하면 RDS CA bundle 을 컨테이너에 포함시켜 ca 옵션 명시 (후속 PR).
    ssl:
      process.env.NODE_ENV === 'production'
        ? { rejectUnauthorized: false }
        : false,
  });

  pool.on('error', (err) => {
    // idle client 에서 발생한 에러는 throw 하면 프로세스가 죽으므로 로깅만.
    console.error('[db] idle pg client error:', err);
  });

  return pool;
}

/**
 * Pool 첫 접근 시점에 생성 + globalThis 에 캐시.
 * 호출 자체는 안전 (이미 캐시되어 있으면 그대로 반환).
 */
export function getPgPool(): Pool {
  if (globalThis.__focusPgPool) return globalThis.__focusPgPool;
  const pool = createPool();
  globalThis.__focusPgPool = pool;
  return pool;
}

export function getDb(): NodePgDatabase<typeof schema> {
  if (globalThis.__focusDrizzle) return globalThis.__focusDrizzle;
  const instance = drizzle(getPgPool(), { schema });
  globalThis.__focusDrizzle = instance;
  return instance;
}

/**
 * Proxy 로 감싼 `db` — repository 코드는 `import { db } from '../client'` 그대로 쓰고,
 * 실제 첫 메서드 호출/속성 접근 시점에 getDb() 가 평가되어 lazy 초기화된다.
 *
 * 첫 접근에서 한 번 getDb() 를 호출하며, NodePgDatabase 의 메서드는 인스턴스에
 * bind 되어 있어 그대로 가져와도 정상 동작.
 */
export const db = new Proxy({} as NodePgDatabase<typeof schema>, {
  get(_, prop) {
    const target = getDb() as unknown as Record<string | symbol, unknown>;
    return target[prop];
  },
}) as NodePgDatabase<typeof schema>;

/**
 * 직접 Pool 이 필요한 코드용 (raw query, transaction, listen/notify 등).
 * Proxy 대신 함수 호출 형태로 노출해 lazy 의도를 명시적으로.
 */
export const pgPool: Pool = new Proxy({} as Pool, {
  get(_, prop) {
    const target = getPgPool() as unknown as Record<string | symbol, unknown>;
    const value = target[prop];
    return typeof value === 'function' ? value.bind(target) : value;
  },
}) as Pool;

export { schema };
