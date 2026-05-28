'use client';

import { useEffect, useRef, useState } from 'react';

export default function WebcamView() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;

    const stopStream = () => {
      stream?.getTracks().forEach((t) => t.stop());
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
    <div className="flex flex-col items-center gap-3">
      {error ? (
        <div className="w-full max-w-2xl rounded-xl px-5 py-4 text-center" style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#991B1B' }}>
          <p className="text-sm font-medium">카메라 접근 실패</p>
          <p className="mt-1 text-xs">{error}</p>
          <p className="mt-2 text-xs" style={{ color: 'var(--color-text-soft)' }}>
            브라우저 권한을 확인하거나 카메라가 연결되어 있는지 확인하세요.
          </p>
        </div>
      ) : (
        <video
          id="webgazerVideoFeed"
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="w-full max-w-2xl rounded-xl"
          style={{ border: '2px solid var(--color-brand-200)' }}
        />
      )}
    </div>
  );
}
