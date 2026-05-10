import { useEffect, useMemo, useRef, useState } from 'react';

interface HeartRateSample {
  value: number;
  timeMs: number;
}

function isValidHeartRate(value: number) {
  return Number.isFinite(value) && value >= 40 && value <= 180;
}

export function useRollingHeartRateAverage(heartRate: number, enabled = true, windowSeconds = 10, resetKey = '') {
  const [samples, setSamples] = useState<HeartRateSample[]>([]);
  const lastAddedRef = useRef(0);

  useEffect(() => {
    setSamples([]);
    lastAddedRef.current = 0;
  }, [resetKey]);

  useEffect(() => {
    if (!enabled) {
      setSamples([]);
      lastAddedRef.current = 0;
      return;
    }

    const value = Number(heartRate);
    if (!isValidHeartRate(value)) return;

    const now = Date.now();
    if (now - lastAddedRef.current < 900) return;

    lastAddedRef.current = now;
    const cutoff = now - windowSeconds * 1000;
    setSamples((current) => [
      ...current.filter((sample) => sample.timeMs >= cutoff),
      { value, timeMs: now },
    ]);
  }, [enabled, heartRate, windowSeconds]);

  return useMemo(() => {
    if (samples.length === 0) return 0;
    const total = samples.reduce((sum, sample) => sum + sample.value, 0);
    return Math.round(total / samples.length);
  }, [samples]);
}
