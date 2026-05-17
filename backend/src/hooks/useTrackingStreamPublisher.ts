'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';

interface TrackingStreamData {
  meetingId: string;
  userId: string;
  heartRate: number;
  heartRateSource: string;
  heartRateStatus?: string;
  gazeX: number;
  gazeY: number;
  rawGazeX?: number;
  rawGazeY?: number;
  isGazeCalibrated: boolean;
  focusScore?: number;
  focusIsFocused?: boolean | null;
  focusThresholdRawScore?: number | null;
  rPPG?: number | null;
  threshold?: number | null;
  page: 'solo' | 'room';
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
    enabled && data.meetingId.length > 0 && data.userId.length > 0
  ), [data.meetingId.length, data.userId.length, enabled]);

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
            meetingId: latest.meetingId,
            userId: latest.userId,
            timestamp: new Date().toISOString(),
            heartRate: latest.heartRate,
            heartRateSource: latest.heartRateSource,
            heartRateStatus: latest.heartRateStatus,
            gaze: {
              x: latest.gazeX,
              y: latest.gazeY,
              rawX: latest.rawGazeX,
              rawY: latest.rawGazeY,
              calibrated: latest.isGazeCalibrated,
            },
            focusScore: latest.focusScore,
            focusIsFocused: latest.focusIsFocused,
            focusThresholdRawScore: latest.focusThresholdRawScore,
            rPPG: latest.rPPG,
            threshold: latest.threshold,
            page: latest.page,
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
