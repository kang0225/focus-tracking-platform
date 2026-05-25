// src/types/tracker.ts

export type HeartRateSourcePreference = 'webcam' | 'apple-watch';

export interface PairingData {
  status: 'waiting' | 'active';
  heartRate: number;
  updatedAt: number;
  appleWatchPaired?: boolean;
  focusScore?: number | null;
  focusThreshold?: number | null;
  focusIsFocused?: boolean | null;
}

export interface PairingResponse {
  pairingCode: string;
}

export interface FocusMetrics {
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

export interface ParticipantMediaState {
  audioEnabled: boolean;
  videoEnabled: boolean;
}

export interface RoomParticipant {
  id: string;
  name: string;
  joinedAt: number;
  lastSeenAt: number;
  metrics: FocusMetrics;
  media: ParticipantMediaState;
}

export interface RoomSnapshot {
  roomId: string;
  maxParticipants: number;
  participants: RoomParticipant[];
}

export type SignalType = 'offer' | 'answer' | 'ice-candidate';

export interface SignalMessage {
  id: number;
  roomId: string;
  from: string;
  to: string;
  type: SignalType;
  payload: unknown;
  createdAt: number;
}
