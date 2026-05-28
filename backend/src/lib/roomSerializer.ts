import type {
  RoomSnapshot,
  RoomParticipant,
  FocusMetrics,
  ParticipantMediaState,
  SignalMessage,
  SignalType,
} from '@/types/tracker';
import type { RoomWithMembers } from '@/db/repositories/rooms';
import type { SignalReadResult } from '@/db/redis';
import * as redis from '@/db/redis';

const emptyMetrics = (): FocusMetrics => ({
  gazeX: 0,
  gazeY: 0,
  heartRate: 0,
  heartRateSource: '대기 중',
  focusScore: 0,
  focusSource: '대기 중',
  focusThreshold: null,
  focusIsFocused: null,
  updatedAt: Date.now(),
});

const defaultMediaState = (): ParticipantMediaState => ({
  audioEnabled: true,
  videoEnabled: true,
});

/**
 * RoomWithMembers + Redis presence/live metrics 를 합쳐 기존 RoomSnapshot 형식으로.
 * 프론트엔드가 기존 응답 모양에 의존하므로 어댑터 필요.
 */
export async function snapshotRoom(input: RoomWithMembers): Promise<RoomSnapshot> {
  const { room, participants } = input;

  const enriched: RoomParticipant[] = await Promise.all(
    participants.map(async (p): Promise<RoomParticipant> => {
      const presence = await redis.getPresence(room.id, p.userId);
      const metrics = await redis.getLiveMetrics(p.userId);
      return {
        id: p.userId,
        name: presence?.displayName ?? p.displayName,
        joinedAt: p.joinedAt.getTime(),
        lastSeenAt: presence?.lastSeenAt ?? p.lastSeenAt.getTime(),
        metrics: metrics ? {
          gazeX: metrics.gazeX,
          gazeY: metrics.gazeY,
          heartRate: metrics.heartRate,
          heartRateSource: metrics.heartRateSource,
          focusScore: metrics.focusScore,
          focusSource: metrics.focusSource,
          focusThreshold: metrics.focusThreshold,
          focusIsFocused: metrics.focusIsFocused,
          updatedAt: metrics.updatedAt,
        } : emptyMetrics(),
        media: presence ? {
          audioEnabled: presence.audioEnabled,
          videoEnabled: presence.videoEnabled,
        } : defaultMediaState(),
      };
    }),
  );

  return {
    roomId: room.id,
    roomType: room.type,
    inviteCode: room.inviteCode ?? undefined,
    maxParticipants: room.maxParticipants,
    participants: enriched.sort((a, b) => a.joinedAt - b.joinedAt),
  };
}

/**
 * Redis stream entry id ("1700000000000-0") → 정수 sequence 변환.
 * 기존 클라이언트가 number 형 sequence 를 기대하므로 ms 부분만 사용.
 */
export function streamIdToSequence(streamId: string): number {
  const [ms] = streamId.split('-');
  const n = Number(ms);
  return Number.isFinite(n) ? n : 0;
}

export function sequenceToStreamId(seq: number): string | null {
  if (!seq || seq <= 0) return null;
  // XRANGE 의 exclusive after 를 위해 그대로 ms 만 사용.
  return `${seq}-0`;
}

export function mapSignal(entry: SignalReadResult): SignalMessage {
  return {
    id: streamIdToSequence(entry.id),
    roomId: '',   // 호출 측에서 채움
    from: entry.signal.from,
    to: entry.signal.to,
    type: entry.signal.type as SignalType,
    payload: entry.signal.payload,
    createdAt: streamIdToSequence(entry.id),
  };
}
