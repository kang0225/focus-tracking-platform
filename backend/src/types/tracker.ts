// src/types/tracker.ts

export interface PairingData {
  status: 'waiting' | 'active';
  heartRate: number;
  updatedAt: number;
  appleWatchPaired?: boolean;
}

export interface PairingResponse {
  pairingCode: string;
}