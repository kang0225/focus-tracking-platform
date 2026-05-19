'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';

interface TrackingStreamData {
  sessionId: string;
  userId: string;
  heartRate: number;
  gazeX: number;
  gazeY: number;
  rPPG?: number | null;
  threshold?: number | null;
}

interface UseTrackingStreamPublisherOptions {
  enabled?: boolean;
  data: TrackingStreamData;
}

export function useTrackingStreamPublisher({ enabled = true, data }: UseTrackingStreamPublisherOptions) {
  const dataRef = useRef(data);
  const requestInFlightRef = useRef(false);
  const stoppedRef = useRef(false);
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    if (enabled) stoppedRef.current = false;
  }, [enabled]);

  const stopPublishing = useCallback(() => {
    stoppedRef.current = true;
    if (intervalRef.current != null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const canPublish = useMemo(() => (
    enabled && data.sessionId.length > 0 && data.userId.length > 0
  ), [data.sessionId.length, data.userId.length, enabled]);

  useEffect(() => {
    if (!canPublish || stoppedRef.current) return undefined;

    const publish = async () => {
      if (stoppedRef.current) return;
      if (requestInFlightRef.current) return;
      requestInFlightRef.current = true;

      const latest = dataRef.current;
      try {
        await fetch('/api/tracking/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            timestamp: toKstIsoString(new Date()),
            userId: latest.userId,
            sessionId: latest.sessionId,
            gazeX: latest.gazeX,
            gazeY: latest.gazeY,
            heartRate: latest.heartRate,
            rPPG: finiteNumberOrNull(latest.rPPG),
            threshold: finiteNumberOrNull(latest.threshold),
          }),
          keepalive: true,
        });
      } catch (error) {
        console.error('Tracking stream publish failed:', error);
      } finally {
        requestInFlightRef.current = false;
      }
    };

    void publish();
    intervalRef.current = window.setInterval(() => void publish(), 1000);
    return () => {
      if (intervalRef.current != null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [canPublish]);

  return {
    stopPublishing,
  };
}

function toKstIsoString(date: Date) {
  const offsetMinutes = 9 * 60;
  const shifted = new Date(date.getTime() + offsetMinutes * 60 * 1000);
  return `${shifted.toISOString().slice(0, 19)}+09:00`;
}

function finiteNumberOrNull(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
