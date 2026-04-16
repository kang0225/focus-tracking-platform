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
        const loadScript = (src: string) => new Promise((resolve) => {
          const script = document.createElement('script');
          script.src = src;
          script.async = true;
          script.onload = resolve;
          document.body.appendChild(script);
        });

        await loadScript('https://docs.opencv.org/4.5.0/opencv.js');
        await loadScript('/webgazer.js');
        await loadScript('/heartbeat.js');
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

  return {
    coordinates,
    isLoaded,
    heartRate,
    heartRateSource,
    scriptsLoaded
  };
}