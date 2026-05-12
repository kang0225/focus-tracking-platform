'use client';

import { useEffect, useRef, useState } from 'react';

export default function WebcamView() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

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
        setError('카메라 장치를 찾을 수 없거나 접근이 거부되었습니다.');
      }
    };

    void getWebcam();

    return () => {
      cancelled = true;
      stopStream();
    };
  }, []);

  return (
    <div className="flex flex-col items-center gap-4">
      <h2 className="text-xl font-bold mb-4">실시간 집중도 모니터링</h2>
      {error ? (
        <div className="w-full max-w-2xl rounded-2xl border border-red-500 bg-red-500/10 p-6 text-center text-red-100 shadow-lg">
          <p className="font-semibold">카메라 접근 실패</p>
          <p className="mt-2 text-sm text-red-200">{error}</p>
          <p className="mt-4 text-sm text-slate-300">브라우저 권한을 확인하거나 카메라가 연결되어 있는지 확인하세요.</p>
        </div>
      ) : (
        <video
          id="webgazerVideoFeed"
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="rounded-lg shadow-lg w-full max-w-2xl border-4 border-blue-500"
        />
      )}
    </div>
  );
}
