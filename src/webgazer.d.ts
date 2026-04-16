// src/webgazer.d.ts
declare module 'webgazer' {
  interface WebGazer {
    begin(): WebGazer;
    setGazeListener(callback: (data: { x: number; y: number } | null, elapsedTime: number) => void): WebGazer;
    showVideoPreview(show: boolean): WebGazer;
    showPredictionPoints(show: boolean): WebGazer;
    pause(): WebGazer;
    resume(): WebGazer;
    end(): WebGazer;
    [key: string]: unknown; // 그 외 알 수 없는 속성들도 수용
  }

  const webgazer: WebGazer;
  export default webgazer;
}