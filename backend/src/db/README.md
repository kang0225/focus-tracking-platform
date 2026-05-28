# DB 레이어

Postgres (RDS) + Redis (ElastiCache) 기반 영속 레이어. Drizzle ORM 사용.

## 디렉토리 구조

```
src/db/
├── client.ts                 pg Pool + Drizzle 인스턴스 (전역 캐시)
├── redis.ts                  presence / live metrics / WebRTC signal helper
├── schema/                   Drizzle 테이블 정의 (TypeScript single source of truth)
│   ├── users.ts
│   ├── sessions.ts
│   ├── devices.ts
│   ├── pairing.ts            pairing_codes, active_pairings
│   ├── rooms.ts              rooms, room_participants
│   ├── tracking.ts           tracking_sessions, minute_samples, jobs, ml_feedback
│   └── index.ts              barrel
├── repositories/             route 가 호출하는 도메인 함수
│   ├── users.ts
│   ├── sessions.ts
│   ├── pairing.ts
│   ├── rooms.ts
│   ├── tracking.ts
│   └── index.ts              barrel
└── migrations/               drizzle-kit generate 가 생성 — 손으로 편집 금지
    ├── 0000_initial.sql
    └── meta/
        ├── _journal.json
        └── 0000_snapshot.json
```

## 환경 변수

```
DATABASE_URL=postgres://user:pass@host:5432/db?sslmode=require
DATABASE_POOL_MAX=10
DATABASE_POOL_IDLE_MS=30000

REDIS_HOST=10.0.11.0
REDIS_PORT=6379
REDIS_STREAM_MAXLEN=10800
```

RDS 마스터 비밀번호는 Terraform (`26_postgres_rds.tf`)에서 Secrets Manager 에 저장되니
ECS task definition 에서 Secrets Manager → 환경변수로 주입해주세요.

## 마이그레이션 운영

| 상황 | 명령 |
|---|---|
| 스키마 수정 후 새 마이그레이션 SQL 생성 | `npm run db:generate` |
| 현재 DB에 적용 | `npm run db:migrate` |
| 로컬 빠른 실험 (마이그레이션 파일 없이 push) | `npm run db:push` |
| GUI 로 데이터 확인 | `npm run db:studio` |

배포 흐름은 컨테이너 startup hook 에서 `drizzle-kit migrate` 를 한 번 돌리거나,
CodeDeploy AppSpec 의 `BeforeAllowTraffic` 단계에서 별도 task 로 실행하는 것을 권장.
어느 쪽이든 **동일 환경에서 동시에 두 인스턴스가 마이그레이션을 시작하지 않도록**
advisory lock (`SELECT pg_advisory_lock(7340034)`) 으로 래핑하면 안전합니다.

## 스키마 요약

| Table | 핵심 | 비고 |
|---|---|---|
| `users` | google_sub UNIQUE | 모든 도메인 테이블의 루트 |
| `sessions` | token_hash UNIQUE, revoked_at | 쿠키엔 raw token 만, DB엔 sha256 만 |
| `devices` | role=pc/phone, user_id | 사용자가 보유한 디바이스 |
| `pairing_codes` | code PK, expires_at, claimed_at | 단명, TTL 5분 |
| `active_pairings` | user_id PK | 사용자당 활성 페어링 1개 |
| `rooms` | id TEXT, type, invite_code | id는 기존 ROOM-/INVITE- 포맷 유지 |
| `room_participants` | (room_id, user_id) UNIQUE WHERE left_at IS NULL | 활성 멤버십 중복 방지 |
| `tracking_sessions` | user_id, room_id?, summary_json | 종료 시 통계 적재 |
| `tracking_minute_samples` | (session_id, minute_index) | 1분 단위 집계 |
| `tracking_jobs` | status enum, result_json | 기존 Redis job status 의 영속 버전 |
| `tracking_pauses` | session_id, paused_at, resumed_at | 일시정지 구간 (랭킹의 유효 시간 계산용) |
| `ml_feedback` | job_id, content_md | LLM 피드백 본문 |

`tracking_sessions` 에는 랭킹용 컬럼이 함께 있습니다: `pause_seconds`, `valid_seconds`,
`high_focus_seconds`, `ranking_score`, `ranking_eligible`, `ranking_formula_version`,
`ranking_date`. 자세한 사용은 아래 "랭킹" 섹션 참고.

raw 시계열 (수 Hz 의 gaze/HR sample) 은 Postgres 에 넣지 않습니다 — Redis 의
`tracking:{meetingId}:{userId}:stream` (`redisStream.ts`) 에 capped stream 으로 두고,
세션 종료 시 1분 버킷으로 다운샘플해 `tracking_minute_samples` 에 적재.

## Redis 키 규약 (redis.ts)

```
presence:room:{roomId}:user:{userId}    HASH  {displayName, audio, video, lastSeenAt}   TTL 120s
presence:room:{roomId}:members          SET   {userId, ...}                              TTL 240s
metrics:live:user:{userId}              STRING JSON                                      TTL 30s
signals:room:{roomId}                   STREAM (XADD MAXLEN ~ 200)                       TTL 30m
leaderboard:daily:{date}:limit:{N}      STRING JSON  리더보드 응답 캐시                  TTL 30s
leaderboard:daily:{date}:user:{userId}  STRING JSON  본인 순위 캐시                      TTL 30s
```

기존 `src/lib/redisStream.ts` 의 `tracking:{meetingId}:{userId}:stream` 및
`tracking:job:{jobId}:status` 키는 그대로 사용. `redis.ts` 는 그 파일의
`sendRedisCommand` 를 재사용해 새 의존성을 도입하지 않음.

## 사용 예시

```ts
import { users, sessions, rooms, tracking } from '@/db/repositories';

// OAuth callback
const user = await users.upsertGoogleUser({ googleSub, email, name, avatarUrl });
const { rawToken } = await sessions.createSession({
  userId: user.id,
  userAgent: req.headers.get('user-agent'),
  ip: req.headers.get('x-forwarded-for'),
});
response.cookies.set('focus_session', rawToken, { httpOnly: true, ... });

// 보호된 라우트
const resolved = await sessions.resolveSession(req.cookies.get('focus_session')?.value);
if (!resolved) return new Response(null, { status: 401 });
const { user } = resolved;

// 방 입장
const { room, participants } = await rooms.matchPublicRoom({
  userId: user.id,
  displayName: user.name,
});

// 트래킹 세션
const session = await tracking.startTrackingSession({ userId: user.id, page: 'solo' });
// ... 라이브 metrics 는 redis.setLiveMetrics(user.id, ...) 로 ...
await tracking.endTrackingSession({
  sessionId: session.id,
  durationSeconds: 1234,
  avgBpm: 78.2,
  focusRatio: 0.71,
  summaryJson: { /* downsampled */ },
});
```

## 랭킹 (Issue #163)

집중 비율 + 유효 측정 시간 기반 점수. **저장은 DB, 리더보드 계산은 서버 SQL,
응답은 Redis 30초 캐시** 하이브리드.

### 공식 (formula version 1)

```
rankingScore = focusRatio * 70 + min(validMinutes / 50, 1) * 30
```

순수 함수 `src/lib/ranking.ts` 의 `computeRankingScore({ focusRatio, validSeconds })`.

규칙:
- `validMinutes < 10` 인 세션은 `ranking_eligible = false` → 리더보드에서 제외
- `pause` 구간은 valid 계산에서 모두 제외 (`tracking_pauses` 테이블)
- 일별 리더보드는 사용자당 최고 점수 세션 1개만 (SQL `DISTINCT ON (user_id)`)
- 동점 시 `high_focus_seconds` 가 큰 사용자 우선

### 데이터 흐름

```
세션 시작
  ↓ tracking.startTrackingSession(...)
[라이브 중] pause/resume 발생 시 ranking.startPause / endPause
세션 종료 + ML job 완료
  ↓ ranking.finalizeSessionRanking({ sessionId, focusRatio, durationSeconds })
    - 열린 pause 닫고 pause_seconds 산출
    - valid_seconds = duration - pause
    - lib/ranking.computeRankingScore() 호출
    - tracking_sessions.{ranking_score, eligible, formula_version, date, ...} UPDATE
    - redis.invalidateLeaderboardCache(date)
리더보드 조회 요청
  → redis.getLeaderboardCache() (HIT 이면 즉시 반환)
  → MISS 면 ranking.getDailyLeaderboard() (DISTINCT ON SQL)
  → redis.setLeaderboardCache(... 30s)
```

### 사용 예시

```ts
import { ranking, tracking } from '@/db/repositories';
import * as redis from '@/db/redis';
import { toRankingDate } from '@/lib/ranking';

// pause/resume 라우트
await ranking.startPause({ sessionId, reason: 'user_paused' });
await ranking.endPause({ sessionId });

// 세션 finalize (ML job 완료 핸들러에서)
const result = await ranking.finalizeSessionRanking({
  sessionId,
  focusRatio: 0.8,
  durationSeconds: 2400,
});
await redis.invalidateLeaderboardCache(result.rankingDate);

// 리더보드 API
const today = toRankingDate(new Date());
const limit = 20;
let board = await redis.getLeaderboardCache(today, limit);
if (!board) {
  board = await ranking.getDailyLeaderboard({ date: today, limit });
  await redis.setLeaderboardCache(today, limit, board);
}
return Response.json({ date: today, entries: board });

// 내 순위
const me = await ranking.getUserDailyRank({ userId: user.id, date: today });
```

### 향후 확장 (formula version ≥ 2)

이슈에서 언급한 안정성 점수 도입 시:
```
rankingScore = focusRatio * 60 + durationScore * 25 + stabilityScore * 15
```
공식을 `lib/ranking.ts` 에 v2 함수로 추가하고 `RANKING_FORMULA_VERSION = 2` 로 올린 뒤,
새 세션부터 v2 로 저장. 과거 v1 세션은 `ranking_formula_version` 컬럼으로 구분되어 그대로 유지
→ 재계산 없이도 일관된 표시 가능. 필요 시 백필 잡으로 일괄 재계산.

대규모 (>10k DAU) 가 되면 리더보드를 Redis ZSET (`ZADD score user_id`) 으로 승격 검토:
- 동점 tiebreaker 는 `score = rankingScore * 1e9 + highFocusSeconds` 인코딩
- 디스플레이 정보는 별도 HMGET 으로 조인

## 아직 안 한 것 (다음 단계)

이 PR 은 **DB 레이어 신규 구축만** 포함합니다. 다음은 별도 마이그레이션 작업으로:

- [ ] `src/lib/auth.ts` 를 sid 기반 쿠키 + `sessions.resolveSession` 으로 교체
- [ ] `src/lib/db.ts` 의 메모리 Map 을 `repositories/*` 호출로 교체
- [ ] `src/app/api/pair/*` 라우트 → `repositories/pairing` 사용
- [ ] `src/app/api/rooms/*` 라우트 → `repositories/rooms` + `redis.ts` 사용
- [ ] `src/proxy.ts` 미들웨어를 sid 기반 검증으로 교체
- [ ] ECS task / CodeDeploy 에 `drizzle-kit migrate` 단계 추가
- [ ] Secrets Manager → 컨테이너 env 매핑 (Terraform `13_ecs.tf`)
- [ ] `/api/tracking/jobs/[jobId]` 완료 처리 시 `ranking.finalizeSessionRanking()` 호출
- [ ] `/api/ranking` (일별 리더보드) + `/api/ranking/me` (내 순위) 라우트 추가
- [ ] `/api/tracking/pause` `/api/tracking/resume` 라우트 (옵션 — UI 가 pause 버튼 노출하면)

위 단계로 넘어가면 "같은 계정 다른 PC 에서 데이터 안 보임" / "같은 PC 다른 계정 섞임" /
"배포 중 방 깨짐" 세 가지 증상이 동시에 해소됩니다.
