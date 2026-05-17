import { useEffect, useState } from 'react';
import { useWebGazer } from '../hooks/useWebGazer';
import { useRPPG } from '../hooks/useRPPG';
import { useRollingHeartRateAverage } from '../hooks/useRollingHeartRateAverage';
import { useRollingGazeAverage } from '../hooks/useRollingGazeAverage';

function isMeasuringStatus(status: string) {
  return [
    'Preparing',
    'Collecting',
    'Calibrating',
    'Measuring',
    'Motion detected',
    '준비',
    '수집',
    '측정',
    '프레임',
    '보정',
    '움직임',
    '유지',
  ].some((needle) => status.includes(needle));
}

export function useConcentrationData() {
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
  const [phoneBpm, setPhoneBpm] = useState<number>(0);
  const {
    bpm: webcamBpm,
    status: webcamBpmStatus,
    error: webcamBpmError,
    focusScore: rppgFocusScore,
    focusRawScore: rppgFocusRawScore,
    focusMetrics: rppgFocusMetrics,
    waveformValue: rppgWaveformValue,
  } = useRPPG('webgazerVideoFeed', phoneBpm <= 0);

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
    const interval = window.setInterval(async () => {
      try {
        const res = await fetch('/api/pair/current');
        if (res.ok) {
          const data: { heartRate?: number } = await res.json();
          setPhoneBpm(Number(data.heartRate) || 0);
        } else {
          setPhoneBpm(0);
        }
      } catch {
        setPhoneBpm(0);
      }
    }, 2000);

    return () => window.clearInterval(interval);
  }, []);

  const rawHeartRate = phoneBpm > 0 ? phoneBpm : webcamBpm;
  const heartRateSource = phoneBpm > 0 ? 'Apple Watch' : 'FacePhys Camera';
  const heartRate = useRollingHeartRateAverage(rawHeartRate, rawHeartRate > 0, 10, heartRateSource);
  const hasGaze = isCalibrated && rawCoordinates.x > 0 && rawCoordinates.y > 0;
  const hasHeartRate = rawHeartRate >= 40 && rawHeartRate <= 180;
  const isHeartRateMeasuring = phoneBpm <= 0 && !webcamBpmError && isMeasuringStatus(webcamBpmStatus);
  const heartRateStatus = phoneBpm > 0
    ? '감지됨'
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
  const normalizedFocusScore = phoneBpm <= 0 && rppgFocusScore != null ? rppgFocusScore : fallbackFocusScore;
  const focusScore = phoneBpm <= 0 ? (rppgFocusRawScore ?? 0) : 0;
  const focusIsFocused = phoneBpm <= 0 ? (rppgFocusMetrics?.isFocused ?? null) : null;
  const focusThresholdRawScore = phoneBpm <= 0 ? (rppgFocusMetrics?.thresholdRawScore ?? null) : null;

  return {
    rawCoordinates,
    coordinates,
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
    focusRawScore: phoneBpm <= 0 ? rppgFocusRawScore : null,
    focusThresholdRawScore,
    focusMetrics: phoneBpm <= 0 ? rppgFocusMetrics : null,
    rPPG: phoneBpm <= 0 ? rppgWaveformValue : null,
    scriptsLoaded,
  };
}
