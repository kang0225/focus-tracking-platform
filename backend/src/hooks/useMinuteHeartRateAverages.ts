import { useEffect, useMemo, useRef, useState } from 'react';

export interface MinuteHeartRateAverage {
  minuteStartMs: number;
  label: string;
  averageBpm: number;
  sampleCount: number;
}

interface MinuteBucket {
  minuteStartMs: number;
  total: number;
  count: number;
}

function isValidHeartRate(value: number) {
  return Number.isFinite(value) && value >= 40 && value <= 180;
}

function minuteStart(timeMs: number) {
  return Math.floor(timeMs / 60000) * 60000;
}

function formatMinuteLabel(minuteStartMs: number) {
  const date = new Date(minuteStartMs);
  const hours = date.getHours();
  const period = hours < 12 ? '오전' : '오후';
  const hour12 = hours % 12 || 12;
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `${period} ${hour12}시 ${minute}분`;
}

export function useMinuteHeartRateAverages(heartRate: number, enabled = true) {
  const latestHeartRateRef = useRef(heartRate);
  const [buckets, setBuckets] = useState<MinuteBucket[]>([]);

  useEffect(() => {
    latestHeartRateRef.current = heartRate;
  }, [heartRate]);

  useEffect(() => {
    if (!enabled) {
      setBuckets([]);
      return undefined;
    }

    const sample = () => {
      const value = Number(latestHeartRateRef.current);
      const currentMinuteStart = minuteStart(Date.now());
      if (!isValidHeartRate(value)) {
        setBuckets((current) => (
          current[0]?.minuteStartMs === currentMinuteStart ? current : []
        ));
        return;
      }

      setBuckets((current) => {
        const existing = current[0]?.minuteStartMs === currentMinuteStart ? current[0] : null;

        if (existing) {
          return [{
            minuteStartMs: currentMinuteStart,
            total: existing.total + value,
            count: existing.count + 1,
          }];
        } else {
          return [{ minuteStartMs: currentMinuteStart, total: value, count: 1 }];
        }
      });
    };

    sample();
    const interval = window.setInterval(sample, 1000);
    return () => window.clearInterval(interval);
  }, [enabled]);

  return useMemo<MinuteHeartRateAverage[]>(() => buckets.map((bucket) => ({
    minuteStartMs: bucket.minuteStartMs,
    label: formatMinuteLabel(bucket.minuteStartMs),
    averageBpm: Math.round(bucket.total / bucket.count),
    sampleCount: bucket.count,
  })), [buckets]);
}
