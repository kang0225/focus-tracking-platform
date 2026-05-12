import { useState, useEffect } from 'react';
import { useWebGazer } from '../hooks/useWebGazer';
import { useRPPG } from '../hooks/useRPPG';
import { useRollingHeartRateAverage } from '../hooks/useRollingHeartRateAverage';
import { useRollingGazeAverage } from '../hooks/useRollingGazeAverage';

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
  } = useRPPG('webgazerVideoFeed', phoneBpm <= 0);

  // 1. 외부 스크립트 로드
  useEffect(() => {
    const loadScripts = async () => {
      try {
        const win = window as any;
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
            const finish = () => {
              if (settled) return;
              settled = true;
              window.clearInterval(interval);
              resolve(true);
            };
            const fail = () => {
              if (settled) return;
              settled = true;
              window.clearInterval(interval);
              reject(new Error(`${src} 로드에 실패했습니다.`));
            };
            const interval = window.setInterval(() => {
              if (isReady()) {
                finish();
              }
            }, 100);
            existing.addEventListener('load', finish, { once: true });
            existing.addEventListener('error', fail, { once: true });
            return;
          }

          const script = document.createElement('script');
          script.src = src;
          script.async = true;
          script.onload = resolve;
          script.onerror = reject;
          document.body.appendChild(script);
        });

        await loadScript('/webgazer.js', () => !!win.webgazer);
        setScriptsLoaded(true);
      } catch (err) {
        console.error('Script loading failed:', err);
      }
    };
    loadScripts();
  }, []);

  // 2. WebGazer 초기화
  useEffect(() => {
    if (scriptsLoaded) initWebGazer();
  }, [scriptsLoaded, initWebGazer]);

  // 3. Apple Watch 데이터 폴링
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/pair/current');
        if (res.ok) {
          const data = await res.json();
          setPhoneBpm(data.heartRate);
        } else {
          setPhoneBpm(0);
        }
      } catch (err) {
        setPhoneBpm(0);
      }
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  // 4. 데이터 가공
  const rawHeartRate = phoneBpm > 0 ? phoneBpm : webcamBpm;
  const heartRateSource = phoneBpm > 0 ? 'Apple Watch' : 'FacePhys Camera';
  const heartRate = useRollingHeartRateAverage(rawHeartRate, rawHeartRate > 0, 10, heartRateSource);
  const hasGaze = isCalibrated && rawCoordinates.x > 0 && rawCoordinates.y > 0;
  const hasHeartRate = rawHeartRate >= 40 && rawHeartRate <= 180;
  const isHeartRateMeasuring = phoneBpm <= 0
    && !webcamBpmError
    && (webcamBpmStatus.includes('준비')
      || webcamBpmStatus.includes('수집')
      || webcamBpmStatus.includes('측정')
      || webcamBpmStatus.includes('프레임')
      || webcamBpmStatus.includes('보정')
      || webcamBpmStatus.includes('움직임')
      || webcamBpmStatus.includes('유지'));
  const heartRateStatus = phoneBpm > 0
    ? '감지됨'
    : hasHeartRate
      ? '감지됨'
      : webcamBpmError
        ? '오류'
        : isHeartRateMeasuring
          ? '측정 중'
          : '대기 중';
  const heartRateStability = heartRate >= 40 && heartRate <= 180 ? Math.max(0, 30 - Math.abs(heartRate - 75) * 0.35) : 0;
  const focusScore = Math.max(0, Math.min(100, Math.round((hasGaze ? 62 : 18) + heartRateStability)));

  return {
    coordinates,
    rawCoordinates,
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
    scriptsLoaded,
  };
}
