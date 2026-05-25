import { useEffect, useRef, useState } from 'react';
import { useWebGazer } from '../hooks/useWebGazer';
import { isRppgMeasuringStatus, useRPPG } from '../hooks/useRPPG';
import { useRollingHeartRateAverage } from '../hooks/useRollingHeartRateAverage';
import { useRollingGazeAverage } from '../hooks/useRollingGazeAverage';
import type { HeartRateSourcePreference, PairingData } from '@/types/tracker';

function finiteMetric(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

interface UseConcentrationDataOptions {
  paused?: boolean;
  heartRateSourcePreference?: HeartRateSourcePreference;
}

export function useConcentrationData({
  paused = false,
  heartRateSourcePreference = 'webcam',
}: UseConcentrationDataOptions = {}) {
  const {
    coordinates: rawCoordinates,
    isLoaded,
    isCalibrated,
    currentCalibrationPointIndex,
    calibrationPointClickCount,
    clicksPerCalibrationPoint,
    totalCalibrationPoints,
    isCalibrationBusy,
    initWebGazer,
    recordCalibrationPoint,
    resetCalibration,
  } = useWebGazer();
  const coordinates = useRollingGazeAverage(rawCoordinates, isLoaded && isCalibrated, 10);
  const [scriptsLoaded, setScriptsLoaded] = useState(false);
  const [watchData, setWatchData] = useState<PairingData | null>(null);
  const wasPausedRef = useRef(false);
  const watchHeartRate = finiteMetric(watchData?.heartRate) ?? 0;
  const watchFocusScore = finiteMetric(watchData?.focusScore);
  const watchFocusThreshold = finiteMetric(watchData?.focusThreshold);
  const hasAvailableAppleWatchData = !!watchData
    && watchData.status === 'active'
    && (
      watchHeartRate > 0
      || watchFocusScore != null
      || watchFocusThreshold != null
    );
  const hasAppleWatchConnection = !!watchData
    && watchData.status === 'active'
    && (watchData.appleWatchPaired === true || hasAvailableAppleWatchData);
  const useAppleWatchData = heartRateSourcePreference === 'apple-watch';
  const hasAppleWatchData = useAppleWatchData && hasAvailableAppleWatchData;
  const hasAppleWatchHeartRate = hasAppleWatchData && watchHeartRate > 0;
  const hasAppleWatchFocusScore = hasAppleWatchData && watchFocusScore != null;
  const {
    bpm: webcamBpm,
    status: webcamBpmStatus,
    error: webcamBpmError,
    focusScore: rppgFocusScore,
    focusRawScore: rppgFocusRawScore,
    focusMetrics: rppgFocusMetrics,
  } = useRPPG('webgazerVideoFeed', !paused && heartRateSourcePreference === 'webcam');

  useEffect(() => {
    const loadScripts = async () => {
      try {
        const win = window as Window & { webgazer?: unknown };
        if (win.webgazer) {
          setScriptsLoaded(true);
          return;
        }

        const loadScript = (src: string, isReady: () => boolean) => new Promise((resolve, reject) => {
          if (isReady()) {
            resolve(true);
            return;
          }

          const existing = document.querySelector(`script[src="${src}"]`);
          if (existing) {
            let settled = false;
            let interval: number | null = null;
            const finish = () => {
              if (settled) return;
              settled = true;
              if (interval != null) window.clearInterval(interval);
              resolve(true);
            };
            const fail = () => {
              if (settled) return;
              settled = true;
              if (interval != null) window.clearInterval(interval);
              reject(new Error(`${src} failed to load.`));
            };
            interval = window.setInterval(() => {
              if (isReady()) finish();
            }, 100);
            existing.addEventListener('load', finish, { once: true });
            existing.addEventListener('error', fail, { once: true });
            return;
          }

          const script = document.createElement('script');
          script.src = src;
          script.async = true;
          script.onload = () => resolve(true);
          script.onerror = () => reject(new Error(`${src} failed to load.`));
          document.body.appendChild(script);
        });

        await loadScript('/webgazer.js', () => !!win.webgazer);
        setScriptsLoaded(true);
      } catch (err) {
        console.error('Script loading failed:', err);
      }
    };

    void loadScripts();
  }, []);

  useEffect(() => {
    if (scriptsLoaded) initWebGazer();
  }, [scriptsLoaded, initWebGazer]);

  useEffect(() => {
    const wg = (window as Window & {
      webgazer?: {
        pause?: () => void;
        resume?: () => void;
        begin?: () => void;
      };
    }).webgazer;
    if (!wg || !isLoaded) return;

    if (paused) {
      wasPausedRef.current = true;
      try {
        wg.pause?.();
      } catch (error) {
        console.warn('WebGazer pause failed:', error);
      }
      return;
    }

    if (wasPausedRef.current) {
      wasPausedRef.current = false;
      try {
        if (wg.resume) {
          wg.resume();
        } else {
          wg.begin?.();
        }
      } catch (error) {
        console.warn('WebGazer resume failed:', error);
      }
    }
  }, [isLoaded, paused]);

  useEffect(() => {
    const interval = window.setInterval(async () => {
      try {
        const res = await fetch('/api/pair/current');
        if (res.ok) {
          const data: PairingData = await res.json();
          setWatchData(data.status === 'active' ? data : null);
        } else {
          setWatchData(null);
        }
      } catch {
        setWatchData(null);
      }
    }, 1000);

    return () => window.clearInterval(interval);
  }, []);

  const rawHeartRate = paused
    ? 0
    : useAppleWatchData
    ? hasAppleWatchHeartRate ? watchHeartRate : 0
    : webcamBpm;
  const heartRateSource = paused
    ? 'paused'
    : useAppleWatchData
    ? 'Apple Watch'
    : 'FacePhys Camera';
  const heartRate = useRollingHeartRateAverage(rawHeartRate, rawHeartRate > 0, 10, heartRateSource);
  const outputRawCoordinates = paused ? { x: 0, y: 0 } : rawCoordinates;
  const outputCoordinates = paused ? { x: 0, y: 0 } : coordinates;
  const hasGaze = isCalibrated && outputRawCoordinates.x > 0 && outputRawCoordinates.y > 0;
  const hasHeartRate = rawHeartRate >= 40 && rawHeartRate <= 180;
  const isHeartRateMeasuring = !paused
    && !useAppleWatchData
    && !webcamBpmError
    && isRppgMeasuringStatus(webcamBpmStatus);
  const heartRateStatus = paused
    ? '일시정지'
    : useAppleWatchData
    ? hasAppleWatchHeartRate
      ? '감지됨'
      : hasAppleWatchConnection
        ? 'Watch 대기'
        : 'Watch 미연결'
    : hasHeartRate
    ? '감지됨'
    : webcamBpmError
      ? '오류'
      : isHeartRateMeasuring
        ? '측정 중'
        : '대기 중';
  const heartRateStability = heartRate >= 40 && heartRate <= 180
    ? Math.max(0, 30 - Math.abs(heartRate - 75) * 0.35)
    : 0;
  const fallbackFocusScore = Math.max(0, Math.min(100, Math.round((hasGaze ? 62 : 18) + heartRateStability)));
  const rawFocusScore = paused
    ? null
    : hasAppleWatchFocusScore
    ? watchFocusScore ?? null
    : useAppleWatchData
    ? null
    : rppgFocusRawScore;
  const normalizedFocusScore = paused
    ? 0
    : hasAppleWatchData
    ? watchFocusScore ?? 0
    : useAppleWatchData
    ? 0
    : rppgFocusScore ?? fallbackFocusScore;
  const focusScore = rawFocusScore ?? 0;
  const focusThresholdRawScore = paused
    ? 0
    : hasAppleWatchData
    ? watchFocusThreshold ?? null
    : useAppleWatchData
    ? null
    : rppgFocusMetrics?.thresholdRawScore ?? null;
  const focusIsFocused = paused
    ? null
    : hasAppleWatchData
    ? watchData?.focusIsFocused ?? (
      watchFocusScore != null && watchFocusThreshold != null
        ? (watchFocusScore ?? 0) >= watchFocusThreshold
        : null
    )
    : useAppleWatchData
    ? null
    : rppgFocusMetrics?.isFocused ?? null;
  const focusSource = paused ? 'paused' : useAppleWatchData ? 'Apple Watch' : 'FacePhys Camera';
  const hasFocusMeasurement = rawFocusScore != null
    && Number.isFinite(rawFocusScore)
    && rawFocusScore !== 0
    && (focusThresholdRawScore != null || focusIsFocused != null);
  const isTrackingReady = !paused
    && hasFocusMeasurement
    && (hasAppleWatchData || hasGaze || hasHeartRate || isHeartRateMeasuring);

  return {
    rawCoordinates: outputRawCoordinates,
    coordinates: outputCoordinates,
    isLoaded,
    isCalibrated,
    currentCalibrationPointIndex,
    calibrationPointClickCount,
    clicksPerCalibrationPoint,
    totalCalibrationPoints,
    isCalibrationBusy,
    recordCalibrationPoint,
    resetCalibration,
    heartRate,
    heartRateSource,
    heartRateStatus,
    isHeartRateMeasuring,
    focusScore,
    focusIsFocused,
    normalizedFocusScore,
    focusRawScore: rawFocusScore,
    focusThresholdRawScore,
    focusSource,
    hasAppleWatchData,
    hasAvailableAppleWatchData,
    hasAppleWatchConnection,
    hasAppleWatchHeartRate,
    hasAppleWatchFocusScore,
    focusMetrics: paused || hasAppleWatchData ? null : rppgFocusMetrics,
    isTrackingReady,
    scriptsLoaded,
  };
}
