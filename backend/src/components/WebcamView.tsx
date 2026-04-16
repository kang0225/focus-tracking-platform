'use client';

import { useEffect, useRef } from 'react';

export default function WebcamView() {
  // HTMLVideoElement 타입을 명시하여 비디오 태그임을 정의
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const getWebcam = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.error("카메라 접근 에러:", err);
      }
    };

    getWebcam();
  }, []);

  return (
    <div className="flex flex-col items-center">
      <h2 className="text-xl font-bold mb-4">실시간 집중도 모니터링</h2>
      <video
        id="webgazerVideoFeed"
        ref={videoRef}
        autoPlay
        playsInline
        className="rounded-lg shadow-lg w-full max-w-2xl border-4 border-blue-500"
      />
    </div>
  );
}