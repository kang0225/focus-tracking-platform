import { useState, useEffect } from 'react';
import { useWebGazer } from '../hooks/useWebGazer';
import { useRPPG } from '../hooks/useRPPG';

export function useConcentrationData() {
  const { coordinates, isLoaded, initWebGazer } = useWebGazer();
  const { bpm: webcamBpm } = useRPPG('webgazerVideoFeed', isLoaded);
  const [scriptsLoaded, setScriptsLoaded] = useState(false);
  const [phoneBpm, setPhoneBpm] = useState<number>(0);

  // 1. 외부 스크립트 로드
  useEffect(() => {
    const loadScripts = async () => {
      try {
        const win = window as any;
        if (win.cv && win.Heartbeat && win.webgazer) {
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

        await loadScript('/opencv.js', () => !!win.cv);
        await loadScript('/webgazer.js', () => !!win.webgazer);
        await loadScript('/heartbeat.js', () => !!win.Heartbeat);
        setScriptsLoaded(true);
      } catch (err) {
        console.error("Script loading failed:", err);
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
        }
      } catch (err) { /* ignore */ }
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  // 4. 데이터 가공
  const heartRate = phoneBpm > 0 ? phoneBpm : webcamBpm;
  const heartRateSource = phoneBpm > 0 ? 'Apple Watch' : 'Camera';
  const hasGaze = coordinates.x > 0 && coordinates.y > 0;
  const hasHeartRate = heartRate >= 40 && heartRate <= 180;
  const heartRateStability = hasHeartRate ? Math.max(0, 30 - Math.abs(heartRate - 75) * 0.35) : 0;
  const focusScore = Math.max(0, Math.min(100, Math.round((hasGaze ? 62 : 18) + heartRateStability)));

  return {
    coordinates,
    isLoaded,
    heartRate,
    heartRateSource,
    focusScore,
    scriptsLoaded
  };
}
