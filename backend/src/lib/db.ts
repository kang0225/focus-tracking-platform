import {
  FocusMetrics,
  PairingData,
  ParticipantMediaState,
  RoomParticipant,
  RoomSnapshot,
  SignalMessage,
  SignalType,
  VideoRoomType,
} from '../types/tracker';
import { randomInt } from 'crypto';
const globalStore = globalThis as typeof globalThis & {
  __focusPairingCodes?: Map<string, PairingData>;
  __focusCurrentPairing?: PairingData | null;
};

export const pairingCodes = globalStore.__focusPairingCodes ??= new Map<string, PairingData>();

export const getCurrentPairing = () => globalStore.__focusCurrentPairing ?? null;
export const setCurrentPairing = (pairing: PairingData | null) => {
  globalStore.__focusCurrentPairing = pairing;
};

const ROOM_CAPACITY = 5;
const PARTICIPANT_TTL_MS = 120_000;
const SIGNAL_TTL_MS = 60_000;

interface VideoRoom {
  id: string;
  type: VideoRoomType;
  inviteCode?: string;
  createdAt: number;
  participants: Map<string, RoomParticipant>;
  signals: SignalMessage[];
}

const videoRooms = new Map<string, VideoRoom>();
let signalSequence = 1;

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

const makeRoomId = () => {
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `ROOM-${random}`;
};

const INVITE_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const INVITE_CODE_LENGTH = 6;

export const normalizeInviteCode = (code: string) => code.trim().replace(/\s+/g, '').toUpperCase();

const makeInviteCode = () => (
  Array.from({ length: INVITE_CODE_LENGTH }, () => INVITE_CODE_CHARS[randomInt(INVITE_CODE_CHARS.length)]).join('')
);

const makeUniqueInviteCode = () => {
  let code = makeInviteCode();
  while ([...videoRooms.values()].some((room) => room.inviteCode === code)) {
    code = makeInviteCode();
  }
  return code;
};

const cleanRoom = (room: VideoRoom) => {
  const now = Date.now();
  for (const [participantId, participant] of room.participants) {
    if (now - participant.lastSeenAt > PARTICIPANT_TTL_MS) {
      room.participants.delete(participantId);
    }
  }

  room.signals = room.signals.filter((signal) => now - signal.createdAt <= SIGNAL_TTL_MS);
};

export const cleanupVideoRooms = () => {
  for (const [roomId, room] of videoRooms) {
    cleanRoom(room);
    if (room.participants.size === 0 && Date.now() - room.createdAt > PARTICIPANT_TTL_MS) {
      videoRooms.delete(roomId);
    }
  }
};

export const serializeRoom = (room: VideoRoom): RoomSnapshot => ({
  roomId: room.id,
  roomType: room.type,
  inviteCode: room.inviteCode,
  maxParticipants: ROOM_CAPACITY,
  participants: [...room.participants.values()].sort((a, b) => a.joinedAt - b.joinedAt),
});

const findRoomByParticipant = (clientId: string) => (
  [...videoRooms.values()].find((room) => room.participants.has(clientId))
);

const touchParticipant = (
  room: VideoRoom,
  clientId: string,
  name: string,
  media?: Partial<ParticipantMediaState>,
) => {
  const participant = room.participants.get(clientId);
  if (!participant) return null;

  participant.name = name || participant.name;
  participant.lastSeenAt = Date.now();
  participant.media = {
    ...participant.media,
    ...media,
  };

  return serializeRoom(room);
};

const addParticipant = (
  room: VideoRoom,
  clientId: string,
  name: string,
  media?: Partial<ParticipantMediaState>,
) => {
  room.participants.set(clientId, {
    id: clientId,
    name: name || `사용자 ${room.participants.size + 1}`,
    joinedAt: Date.now(),
    lastSeenAt: Date.now(),
    metrics: emptyMetrics(),
    media: {
      ...defaultMediaState(),
      ...media,
    },
  });

  return serializeRoom(room);
};

export const matchVideoRoom = (
  clientId: string,
  name: string,
  media?: Partial<ParticipantMediaState>,
) => {
  cleanupVideoRooms();

  const existingRoom = findRoomByParticipant(clientId);
  if (existingRoom) {
    return touchParticipant(existingRoom, clientId, name, media)!;
  }

  let room = [...videoRooms.values()].find((candidate) => (
    candidate.type === 'public' && candidate.participants.size < ROOM_CAPACITY
  ));
  if (!room) {
    room = {
      id: makeRoomId(),
      type: 'public',
      createdAt: Date.now(),
      participants: new Map(),
      signals: [],
    };
    videoRooms.set(room.id, room);
  }

  return addParticipant(room, clientId, name, media);
};

export const createInviteVideoRoom = (
  clientId: string,
  name: string,
  media?: Partial<ParticipantMediaState>,
) => {
  cleanupVideoRooms();

  const existingRoom = findRoomByParticipant(clientId);
  if (existingRoom) {
    return touchParticipant(existingRoom, clientId, name, media)!;
  }

  const inviteCode = makeUniqueInviteCode();
  const room: VideoRoom = {
    id: `INVITE-${inviteCode}`,
    type: 'invite',
    inviteCode,
    createdAt: Date.now(),
    participants: new Map(),
    signals: [],
  };
  videoRooms.set(room.id, room);

  return addParticipant(room, clientId, name, media);
};

export const joinInviteVideoRoom = (
  inviteCode: string,
  clientId: string,
  name: string,
  media?: Partial<ParticipantMediaState>,
): { status: 'joined'; room: RoomSnapshot } | { status: 'not-found' } | { status: 'full' } => {
  cleanupVideoRooms();

  const existingRoom = findRoomByParticipant(clientId);
  if (existingRoom) {
    return { status: 'joined', room: touchParticipant(existingRoom, clientId, name, media)! };
  }

  const normalizedCode = normalizeInviteCode(inviteCode);
  const room = [...videoRooms.values()].find((candidate) => (
    candidate.type === 'invite' && candidate.inviteCode === normalizedCode
  ));

  if (!room) return { status: 'not-found' };
  if (room.participants.size >= ROOM_CAPACITY) return { status: 'full' };

  return { status: 'joined', room: addParticipant(room, clientId, name, media) };
};

export const getVideoRoom = (roomId: string) => {
  cleanupVideoRooms();
  const room = videoRooms.get(roomId);
  if (!room) return null;
  cleanRoom(room);
  return room;
};

export const updateRoomParticipant = (
  roomId: string,
  clientId: string,
  metrics?: Partial<FocusMetrics>,
  media?: Partial<ParticipantMediaState>,
  name?: string,
) => {
  const room = getVideoRoom(roomId);
  if (!room) return null;

  const participant = room.participants.get(clientId);
  if (!participant) return null;

  participant.lastSeenAt = Date.now();
  participant.name = name || participant.name;
  if (metrics) {
    participant.metrics = {
      ...participant.metrics,
      ...metrics,
      updatedAt: Date.now(),
    };
  }
  if (media) {
    participant.media = {
      ...participant.media,
      ...media,
    };
  }

  return serializeRoom(room);
};

export const addRoomSignal = (
  roomId: string,
  from: string,
  to: string,
  type: SignalType,
  payload: unknown,
) => {
  const room = getVideoRoom(roomId);
  if (!room || !room.participants.has(from) || !room.participants.has(to)) return null;

  const signal: SignalMessage = {
    id: signalSequence++,
    roomId,
    from,
    to,
    type,
    payload,
    createdAt: Date.now(),
  };
  room.signals.push(signal);
  return signal;
};

export const getRoomEvents = (roomId: string, clientId: string, afterSignalId: number) => {
  const room = getVideoRoom(roomId);
  if (!room) return null;

  const participant = room.participants.get(clientId);
  if (!participant) return null;
  participant.lastSeenAt = Date.now();

  return {
    room: serializeRoom(room),
    signals: room.signals.filter((signal) => signal.to === clientId && signal.id > afterSignalId),
  };
};

export const leaveVideoRoom = (roomId: string, clientId: string) => {
  const room = videoRooms.get(roomId);
  if (!room) return false;

  room.participants.delete(clientId);
  room.signals = room.signals.filter((signal) => signal.from !== clientId && signal.to !== clientId);
  if (room.participants.size === 0) videoRooms.delete(roomId);
  return true;
};
