/**
 * Next.js instrumentation hook — 서버 부팅 시 1회 실행.
 *
 * 여기서는 DB 마이그레이션을 자동 적용한다. 두 가지 gate:
 *   (1) NEXT_RUNTIME === 'nodejs' — Edge runtime 에서는 pg 못 씀, dynamic
 *       import 가 그쪽으로 가버리면 빌드/부팅 실패. Node 런타임에서만 진행.
 *   (2) RUN_MIGRATIONS === 'true' — 명시 opt-in. 로컬 dev 에서 의도치 않게
 *       돌지 않도록 안전 스위치.
 *
 * 실패 시 throw → Next.js 부팅 abort → 컨테이너 unhealthy →
 * ECS 자동 재시작 / CodeDeploy 가 traffic shift 차단 → 이전 버전 유지.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (process.env.RUN_MIGRATIONS !== 'true') {
    console.log('[instrumentation] RUN_MIGRATIONS != true, skipping migrations');
    return;
  }

  // 동적 import — Edge runtime 으로 코드가 들어가는 일이 없도록 보장.
  const { runMigrations } = await import('./db/migrate-runner');
  await runMigrations();
}
