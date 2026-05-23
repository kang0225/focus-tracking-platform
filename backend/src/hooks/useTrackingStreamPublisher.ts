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
  isTrackingReady: boolean;
  page: 'solo' | 'room';
}

interface UseTrackingStreamPublisherOptions {
  enabled?: boolean;
  paused?: boolean;
  data: TrackingStreamData;
}

function buildPayload(latest: TrackingStreamData, paused: boolean) {
  const viewport = typeof window === 'undefined'
    ? { width: undefined, height: undefined }
    : { width: window.innerWidth, height: window.innerHeight };

  if (paused) {
    return {
      meetingId: latest.meetingId,
      userId: latest.userId,
      timestamp: new Date().toISOString(),
      heartRate: 0,
      heartRateSource: 'paused',
      heartRateStatus: '일시정지',
      gaze: {
        x: 0,
        y: 0,
        rawX: 0,
        rawY: 0,
        viewportWidth: viewport.width,
        viewportHeight: viewport.height,
        calibrated: false,
      },
      focusScore: 0,
      focusIsFocused: null,
      focusThresholdRawScore: 0,
      page: latest.page,
    };
  }

  return {
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
      viewportWidth: viewport.width,
      viewportHeight: viewport.height,
      calibrated: latest.isGazeCalibrated,
    },
    focusScore: latest.focusScore,
    focusIsFocused: latest.focusIsFocused,
    focusThresholdRawScore: latest.focusThresholdRawScore,
    page: latest.page,
  };
}

function finiteNumber(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value);
}

function isPublishableSample(latest: TrackingStreamData, paused: boolean) {
  if (paused || !latest.isTrackingReady) return false;

  const hasFocusScore = finiteNumber(latest.focusScore) && latest.focusScore !== 0;
  const hasFocusDecision = finiteNumber(latest.focusThresholdRawScore) || latest.focusIsFocused != null;
  const hasHeartRate = latest.heartRate >= 40 && latest.heartRate <= 180;
  const hasGaze = latest.isGazeCalibrated
    && latest.gazeX > 0
    && latest.gazeY > 0;

  return hasFocusScore && hasFocusDecision && (hasHeartRate || hasGaze);
}

export function useTrackingStreamPublisher({ enabled = true, paused = false, data }: UseTrackingStreamPublisherOptions) {
  const dataRef = useRef(data);
  const pausedRef = useRef(paused);
  const requestInFlightRef = useRef(false);
  const stoppedRef = useRef(false);
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

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
    enabled && !paused && data.isTrackingReady && data.meetingId.length > 0 && data.userId.length > 0
  ), [data.isTrackingReady, data.meetingId.length, data.userId.length, enabled, paused]);

  useEffect(() => {
    if (!canPublish || stoppedRef.current) return undefined;

    const publish = async () => {
      if (stoppedRef.current) return;
      if (requestInFlightRef.current) return;

      const latest = dataRef.current;
      if (!isPublishableSample(latest, pausedRef.current)) return;

      requestInFlightRef.current = true;
      try {
        await fetch('/api/tracking/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildPayload(latest, pausedRef.current)),
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
