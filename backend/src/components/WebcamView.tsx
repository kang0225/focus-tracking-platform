'use client';

import { useEffect, useRef } from 'react';

export default function WebcamView() {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;

    const stopStream = () => {
      stream?.getTracks().forEach((track) => track.stop());
      stream = null;
      if (videoRef.current) videoRef.current.srcObject = null;
    };

    const getWebcam = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user' },
          audio: false,
        });

        if (cancelled) {
          stopStream();
          return;
        }

        const video = videoRef.current;
        if (!video) return;

        video.srcObject = stream;
        video.muted = true;
        await video.play().catch(() => undefined);
      } catch (err) {
        console.error('카메라 접근 에러:', err);
      }
    };

    void getWebcam();

    return () => {
      cancelled = true;
      stopStream();
    };
  }, []);

  return (
    <div className="flex flex-col items-center">
      <h2 className="text-xl font-bold mb-4">실시간 집중도 모니터링</h2>
      <video
        id="webgazerVideoFeed"
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className="rounded-lg shadow-lg w-full max-w-2xl border-4 border-blue-500"
      />
    </div>
  );
}
