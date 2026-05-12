import { useState, useEffect, useCallback } from 'react';

const CLICKS_PER_CALIBRATION_POINT = 3;
const TOTAL_CALIBRATION_POINTS = 9;

export function useWebGazer() {
  const [coordinates, setCoordinates] = useState({ x: 0, y: 0 });
  const [isLoaded, setIsLoaded] = useState(false);
  const [isCalibrated, setIsCalibrated] = useState(false);
  const [currentCalibrationPointIndex, setCurrentCalibrationPointIndex] = useState(0);
  const [calibrationPointClickCount, setCalibrationPointClickCount] = useState(0);
  const [isCalibrationBusy, setIsCalibrationBusy] = useState(false);

  const initWebGazer = useCallback(() => {
    //webgazer 초기화 해서 시선 데이터 받아오기 시작
    const wg = (window as any).webgazer;
    if (!wg) return;

    wg.saveDataAcrossSessions(false).applyKalmanFilter(true);
    wg.setGazeListener((data: any) => {
      if (data) setCoordinates({ x: Math.floor(data.x), y: Math.floor(data.y) });
    }).begin();

    wg.showVideoPreview(false).showPredictionPoints(false);

    setIsLoaded(true);
  }, []);

  const recordCalibrationPoint = useCallback((xPercent: number, yPercent: number) => {
    const wg = (window as any).webgazer;
    if (!wg || !isLoaded || isCalibrated || isCalibrationBusy) return;

    const x = Math.round(window.innerWidth * (xPercent / 100));
    const y = Math.round(window.innerHeight * (yPercent / 100));
    wg.recordScreenPosition(x, y, 'click');

    setCalibrationPointClickCount((currentCount) => {
      const nextCount = currentCount + 1;
      if (nextCount < CLICKS_PER_CALIBRATION_POINT) return nextCount;

      setCurrentCalibrationPointIndex((currentIndex) => {
        const nextIndex = currentIndex + 1;
        if (nextIndex >= TOTAL_CALIBRATION_POINTS) {
          setIsCalibrated(true);
          return currentIndex;
        }
        return nextIndex;
      });

      return 0;
    });
  }, [isCalibrated, isCalibrationBusy, isLoaded]);

  const resetCalibration = useCallback(async () => {
    const wg = (window as any).webgazer;
    setIsCalibrationBusy(true);

    try {
      if (wg?.clearData) {
        await wg.clearData();
      }
      setCoordinates({ x: 0, y: 0 });
      setIsCalibrated(false);
      setCurrentCalibrationPointIndex(0);
      setCalibrationPointClickCount(0);
    } finally {
      setIsCalibrationBusy(false);
    }
  }, []);

  //컴포넌트 언마운트 시 웹게이저 정리
  useEffect(() => {
    return () => {
      const wg = (window as any).webgazer;
      if (wg) {
        try {
          // 1. 추적 중지 및 비디오 정지
          wg.pause();
          wg.stopVideo(); // 비디오 스트림을 먼저 명확히 끕니다.
          
          // 2. WebGazer가 만든 UI 엘리먼트들이 남아있다면 강제로 제거 (but keep our video element)
          const canvasElement = document.getElementById('webgazerVideoCanvas');
          const faceDot = document.getElementById('webgazerFaceDot');
          const faceFeedback = document.getElementById('webgazerFaceFeedbackBox');

          if (canvasElement) canvasElement.remove();
          if (faceDot) faceDot.remove();
          if (faceFeedback) faceFeedback.remove();

          // 3. 엔진 종료
          wg.end();
        } catch (e) {
          console.log("WebGazer 정리 중 무시된 에러:", e);
        }
      }
    };
  }, []);

  return {
    coordinates,
    isLoaded,
    isCalibrated,
    currentCalibrationPointIndex,
    calibrationPointClickCount,
    clicksPerCalibrationPoint: CLICKS_PER_CALIBRATION_POINT,
    totalCalibrationPoints: TOTAL_CALIBRATION_POINTS,
    isCalibrationBusy,
    initWebGazer,
    recordCalibrationPoint,
    resetCalibration,
  };
}
