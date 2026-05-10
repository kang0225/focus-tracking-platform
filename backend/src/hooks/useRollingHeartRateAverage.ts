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
  const latestHeartRateRef = useRef(heartRate);

  useEffect(() => {
    latestHeartRateRef.current = heartRate;
  }, [heartRate]);

  useEffect(() => {
    setSamples([]);
  }, [resetKey]);

  useEffect(() => {
    if (!enabled) {
      setSamples([]);
      return undefined;
    }

    const sample = () => {
      const value = Number(latestHeartRateRef.current);
      const now = Date.now();
      const cutoff = now - windowSeconds * 1000;

      setSamples((current) => {
        const recentSamples = current.filter((sample) => sample.timeMs >= cutoff);
        if (!isValidHeartRate(value)) return recentSamples;

        return [
          ...recentSamples,
          { value, timeMs: now },
        ];
      });
    };

    sample();
    const interval = window.setInterval(sample, 1000);
    return () => window.clearInterval(interval);
  }, [enabled, windowSeconds, resetKey]);

  return useMemo(() => {
    if (samples.length === 0) return 0;
    const total = samples.reduce((sum, sample) => sum + sample.value, 0);
    return Math.round(total / samples.length);
  }, [samples]);
}
