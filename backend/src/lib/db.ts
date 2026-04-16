import { PairingData } from '../types/tracker';
export const pairingCodes = new Map<string, PairingData>();
let _currentPairing: PairingData | null = null;

export const getCurrentPairing = () => _currentPairing;
export const setCurrentPairing = (pairing: PairingData | null) => {
  _currentPairing = pairing;
};