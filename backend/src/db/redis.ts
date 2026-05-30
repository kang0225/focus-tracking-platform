/**
 * Redis 헬퍼.
 *
 * 기존 src/lib/redisStream.ts 에 minimal RESP 클라이언트가 이미 있어서
 * 이 모듈은 그 sendRedisCommand 를 재사용해 presence / signals / live metrics
 * 용도의 high-level helper 만 제공한다. 새 의존성을 도입하지 않는다.
 */
import { sendRedisCommand } from '@/lib/redisStream';
import { getRankingRangeDates, type RankingRange } from '@/lib/ranking';

const PRESENCE_TTL_SECONDS = 120;
const METRICS_TTL_SECONDS = 30;
const SIGNAL_STREAM_MAXLEN = 200;
const SIGNAL_STREAM_TTL_SECONDS = 60 * 30; // 안 쓰는 방의 stream 키 자동 정리
const LEADERBOARD_CACHE_TTL_SECONDS = 30;  // 일별 리더보드 응답 캐시 TTL

const presenceKey = (roomId: string, userId: string) =>
  `presence:room:${roomId}:user:${userId}`;
const presenceSetKey = (roomId: string) => `presence:room:${roomId}:members`;
const metricsKey = (userId: string) => `metrics:live:user:${userId}`;
const signalsKey = (roomId: string) => `signals:room:${roomId}`;

export interface PresencePayload {
  displayName: string;
  audioEnabled: boolean;
  videoEnabled: boolean;
  lastSeenAt: number;
}

export async function setPresence(
  roomId: string,
  userId: string,
  payload: PresencePayload,
): Promise<void> {
  const key = presenceKey(roomId, userId);
  await sendRedisCommand([
    'HSET',
    key,
    'displayName',
    payload.displayName,
    'audioEnabled',
    String(payload.audioEnabled),
    'videoEnabled',
    String(payload.videoEnabled),
    'lastSeenAt',
    String(payload.lastSeenAt),
  ]);
  await sendRedisCommand(['EXPIRE', key, String(PRESENCE_TTL_SECONDS)]);
  await sendRedisCommand(['SADD', presenceSetKey(roomId), userId]);
  await sendRedisCommand([
    'EXPIRE',
    presenceSetKey(roomId),
    String(PRESENCE_TTL_SECONDS * 2),
  ]);
}

export async function getPresence(
  roomId: string,
  userId: string,
): Promise<PresencePayload | null> {
  const reply = (await sendRedisCommand(['HGETALL', presenceKey(roomId, userId)])) as
    | unknown[]
    | null;
  if (!Array.isArray(reply) || reply.length === 0) return null;

  const map = new Map<string, string>();
  for (let i = 0; i < reply.length; i += 2) {
    map.set(String(reply[i]), String(reply[i + 1]));
  }
  return {
    displayName: map.get('displayName') ?? '',
    audioEnabled: map.get('audioEnabled') === 'true',
    videoEnabled: map.get('videoEnabled') === 'true',
    lastSeenAt: Number(map.get('lastSeenAt') ?? 0),
  };
}

export async function listRoomPresence(roomId: string): Promise<string[]> {
  const reply = (await sendRedisCommand(['SMEMBERS', presenceSetKey(roomId)])) as
    | unknown[]
    | null;
  if (!Array.isArray(reply)) return [];
  return reply.map((v) => String(v));
}

export async function dropPresence(roomId: string, userId: string): Promise<void> {
  await sendRedisCommand(['DEL', presenceKey(roomId, userId)]);
  await sendRedisCommand(['SREM', presenceSetKey(roomId), userId]);
}

export interface LiveMetricsPayload {
  gazeX: number;
  gazeY: number;
  heartRate: number;
  heartRateSource: string;
  focusScore: number;
  focusSource?: string;
  focusThreshold?: number | null;
  focusIsFocused?: boolean | null;
  updatedAt: number;
}

export async function setLiveMetrics(
  userId: string,
  payload: LiveMetricsPayload,
): Promise<void> {
  const key = metricsKey(userId);
  await sendRedisCommand(['SET', key, JSON.stringify(payload), 'EX', String(METRICS_TTL_SECONDS)]);
}

export async function getLiveMetrics(
  userId: string,
): Promise<LiveMetricsPayload | null> {
  const reply = await sendRedisCommand(['GET', metricsKey(userId)]);
  if (typeof reply !== 'string') return null;
  try {
    return JSON.parse(reply) as LiveMetricsPayload;
  } catch {
    return null;
  }
}

export type SignalType = 'offer' | 'answer' | 'ice-candidate';

export interface SignalPayload {
  from: string;
  to: string;
  type: SignalType;
  payload: unknown;
}

/**
 * WebRTC signaling 을 Redis Stream 으로. XADD 시 MAXLEN 으로 capped,
 * 추가로 EXPIRE 를 갱신해 빈 방의 stream 키를 자동 정리.
 *
 * 반환값은 Redis 가 생성한 stream entry id (e.g. "1700000000000-0").
 */
export async function pushSignal(
  roomId: string,
  signal: SignalPayload,
): Promise<string> {
  const key = signalsKey(roomId);
  const id = await sendRedisCommand([
    'XADD',
    key,
    'MAXLEN',
    '~',
    String(SIGNAL_STREAM_MAXLEN),
    '*',
    'from',
    signal.from,
    'to',
    signal.to,
    'type',
    signal.type,
    'payload',
    JSON.stringify(signal.payload),
  ]);
  await sendRedisCommand(['EXPIRE', key, String(SIGNAL_STREAM_TTL_SECONDS)]);
  return String(id);
}

export interface SignalReadResult {
  id: string;
  signal: SignalPayload;
}

/**
 * afterId 이후의 signal 중, to == userId 인 것만 반환.
 * XRANGE 로 전체를 받아 필터링 (capped stream 이라 부담 작음).
 */
export async function readSignalsFor(
  roomId: string,
  userId: string,
  afterId: string | null,
): Promise<SignalReadResult[]> {
  const start = afterId ? `(${afterId}` : '-';
  const reply = (await sendRedisCommand([
    'XRANGE',
    signalsKey(roomId),
    start,
    '+',
  ])) as unknown[] | null;

  if (!Array.isArray(reply)) return [];

  const results: SignalReadResult[] = [];
  for (const entry of reply) {
    if (!Array.isArray(entry) || entry.length < 2) continue;
    const id = String(entry[0]);
    const fields = entry[1] as unknown[];
    if (!Array.isArray(fields)) continue;

    const map = new Map<string, string>();
    for (let i = 0; i < fields.length; i += 2) {
      map.set(String(fields[i]), String(fields[i + 1]));
    }

    const to = map.get('to');
    if (to !== userId) continue;

    let payload: unknown = null;
    try {
      payload = JSON.parse(map.get('payload') ?? 'null');
    } catch {
      payload = null;
    }

    results.push({
      id,
      signal: {
        from: map.get('from') ?? '',
        to,
        type: (map.get('type') ?? 'offer') as SignalType,
        payload,
      },
    });
  }

  return results;
}

export async function deleteRoomSignals(roomId: string): Promise<void> {
  await sendRedisCommand(['DEL', signalsKey(roomId)]);
}

// ────────────────────────────────────────────────────────────────────
// Leaderboard 캐시 (Issue #163)
// ────────────────────────────────────────────────────────────────────
//
// 리더보드는 read-heavy / write-light 라 단순 JSON 문자열 캐시로 충분.
// ZSET 으로 옮기면 동점 처리 + display name JOIN 이 까다로워져 MVP 에선
// SQL DISTINCT ON + 짧은 TTL 캐시 조합이 가장 단순.

const leaderboardKey = (date: string, limit: number) =>
  `leaderboard:daily:${date}:limit:${limit}`;

const userRankKey = (date: string, userId: string) =>
  `leaderboard:daily:${date}:user:${userId}`;

export async function getLeaderboardCache<T = unknown>(
  date: string,
  limit: number,
): Promise<T | null> {
  const reply = await sendRedisCommand(['GET', leaderboardKey(date, limit)]);
  if (typeof reply !== 'string') return null;
  try {
    return JSON.parse(reply) as T;
  } catch {
    return null;
  }
}

export async function setLeaderboardCache<T = unknown>(
  date: string,
  limit: number,
  value: T,
  ttlSeconds: number = LEADERBOARD_CACHE_TTL_SECONDS,
): Promise<void> {
  await sendRedisCommand([
    'SET',
    leaderboardKey(date, limit),
    JSON.stringify(value),
    'EX',
    String(ttlSeconds),
  ]);
}

export async function getUserRankCache<T = unknown>(
  date: string,
  userId: string,
): Promise<T | null> {
  const reply = await sendRedisCommand(['GET', userRankKey(date, userId)]);
  if (typeof reply !== 'string') return null;
  try {
    return JSON.parse(reply) as T;
  } catch {
    return null;
  }
}

export async function setUserRankCache<T = unknown>(
  date: string,
  userId: string,
  value: T,
  ttlSeconds: number = LEADERBOARD_CACHE_TTL_SECONDS,
): Promise<void> {
  await sendRedisCommand([
    'SET',
    userRankKey(date, userId),
    JSON.stringify(value),
    'EX',
    String(ttlSeconds),
  ]);
}

/**
 * 새 세션의 finalize 직후 호출. 해당 날짜 캐시들을 무효화.
 * (limit 별 키가 여러 개라 prefix 스캔이 필요하지만, MVP 에선 흔한 limit 값만 명시 삭제.)
 */
export async function invalidateLeaderboardCache(date: string): Promise<void> {
  const commonLimits = [10, 20, 50, 100];
  const cacheKeys = new Set<string>([date]);
  const ranges: RankingRange[] = ['day', 'week', 'month'];

  for (const range of ranges) {
    const { start, end } = getRankingRangeDates(date, range);
    cacheKeys.add(`${range}:${date}`);
    cacheKeys.add(range === 'day' ? `day:${start}` : `${range}:${start}:${end}`);
  }

  for (const cacheKey of cacheKeys) {
    for (const l of commonLimits) {
      await sendRedisCommand(['DEL', leaderboardKey(cacheKey, l)]);
    }
  }
}
