import { useState, useEffect } from 'react';

export function useRPPG(videoElementId: string, isLoaded: boolean) {
  const [bpm, setBpm] = useState<number>(0);

  useEffect(() => {
    const win = window as any;
    
    // OpenCV와 Heartbeat이 로드될 때까지 대기
    if (!isLoaded) {
      console.log("rPPG: 라이브러리 로드 대기 중...");
      return;
    }

    console.log("rPPG: 라이브러리 로드됨, 초기화 시작");

    // OpenCV 로드 확인
    if (!win.cv) {
      console.warn("OpenCV(cv)가 아직 로드되지 않았습니다. 대기 중...");
      const checkInterval = setInterval(() => {
        if (win.cv && win.Heartbeat) {
          clearInterval(checkInterval);
          initHeartbeat();
        }
      }, 500);
      return () => clearInterval(checkInterval);
    }

    // Heartbeat 클래스 확인
    if (!win.Heartbeat) {
      console.error("Heartbeat 클래스를 찾을 수 없습니다.");
      return;
    }

    console.log("rPPG: Heartbeat 클래스 발견, 초기화 진행");

    let hb: any = null;

    const initHeartbeat = async () => {
      try {
        // 1. WebGazer가 비디오 태그를 생성할 때까지 대기
        let video = document.getElementById(videoElementId);
        let attempts = 0;
        while (!video && attempts < 50) {
          await new Promise(r => setTimeout(r, 100));
          video = document.getElementById(videoElementId);
          attempts++;
        }

        if (!video) {
          console.error(`비디오 태그 '${videoElementId}'를 찾을 수 없습니다.`);
          return;
        }

        console.log("Heartbeat 초기화 중...");

        hb = new win.Heartbeat(
          videoElementId,
          'heartbeatCanvas',
          '/haarcascade_frontalface_alt.xml',
          30, // targetFps
          6,  // windowSize
          1000 // rppgInterval
        );

        // 2. BPM 업데이트 처리
        hb.drawBPM = (calculatedBpm: number) => {
          console.log("계산된 BPM:", calculatedBpm);
          if (calculatedBpm > 40 && calculatedBpm < 180) {
            setBpm(Math.round(calculatedBpm));
          }
        };

        // 3. Heartbeat 엔진 시작
        await hb.init();
        console.log("Heartbeat 엔진이 성공적으로 시작되었습니다.");
      } catch (error) {
        console.error("rPPG 실행 실패:", error);
      }
    };

    initHeartbeat();

    return () => {
      if (hb && hb.stop) {
        try {
          hb.stop();
          console.log("Heartbeat 엔진이 종료되었습니다.");
        } catch (e) {
          console.log("Heartbeat 정리 중 에러:", e);
        }
      }
    };
  }, [videoElementId, isLoaded]);

  return { bpm };
}