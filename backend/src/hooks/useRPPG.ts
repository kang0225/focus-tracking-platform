import { useEffect, useRef, useState } from 'react';

const TARGET_SIZE = 36;
const CHANNELS = 3;
const DEFAULT_FPS = 15;

export interface RppgFocusResponse {
  score: number;
  rawScore: number;
  thresholdRawScore: number;
  isFocused: boolean;
  ppiMs: number;
  rmssdPpiMs: number;
  hfPpiPower: number;
  peakIntervalCount: number;
  sampleCount: number;
  durationSeconds: number;
}

interface FacePhysRppgResponse {
  sessionId: string;
  frameIndex: number;
  bpm: number | null;
  rawBpm: number | null;
  confidence: number | null;
  phase?: 'collecting' | 'preview' | 'stable';
  motionScore?: number | null;
  motionQuality?: number;
  motionArtifact?: boolean;
  sampleCount: number;
  durationSeconds: number;
  focus?: RppgFocusResponse | null;
  ready: boolean;
}

interface RppgRoi {
  x: number;
  y: number;
  width: number;
  height: number;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function defaultFaceRoi(video: HTMLVideoElement): RppgRoi {
  const videoWidth = video.videoWidth || video.clientWidth || 1;
  const videoHeight = video.videoHeight || video.clientHeight || 1;
  const size = Math.round(Math.min(videoWidth, videoHeight) * 0.64);
  const x = Math.round((videoWidth - size) / 2);
  const y = Math.round((videoHeight - size) * 0.34);

  return {
    x: clamp(x, 0, Math.max(0, videoWidth - size)),
    y: clamp(y, 0, Math.max(0, videoHeight - size)),
    width: clamp(size, 1, videoWidth),
    height: clamp(size, 1, videoHeight),
  };
}

function getVideoCandidates(videoElementId: string) {
  const candidates = Array.from(document.querySelectorAll<HTMLVideoElement>('video'))
    .filter((video) => video.id === videoElementId);
  const byId = document.getElementById(videoElementId);

  if (byId instanceof HTMLVideoElement && !candidates.includes(byId)) {
    candidates.unshift(byId);
  }

  return candidates;
}

function isVideoReady(video: HTMLVideoElement) {
  return video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0;
}

function findReadyVideo(videoElementId: string) {
  return getVideoCandidates(videoElementId).find(isVideoReady) ?? null;
}

function captureFacePhysFrame(video: HTMLVideoElement, canvas: HTMLCanvasElement) {
  const roi = defaultFaceRoi(video);
  canvas.width = TARGET_SIZE;
  canvas.height = TARGET_SIZE;

  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Canvas 2D context is unavailable.');

  context.drawImage(video, roi.x, roi.y, roi.width, roi.height, 0, 0, TARGET_SIZE, TARGET_SIZE);
  const rgba = context.getImageData(0, 0, TARGET_SIZE, TARGET_SIZE).data;
  const frame = new Array<number>(TARGET_SIZE * TARGET_SIZE * CHANNELS);

  for (let rgbaIndex = 0, rgbIndex = 0; rgbaIndex < rgba.length; rgbaIndex += 4, rgbIndex += 3) {
    frame[rgbIndex] = rgba[rgbaIndex] / 255;
    frame[rgbIndex + 1] = rgba[rgbaIndex + 1] / 255;
    frame[rgbIndex + 2] = rgba[rgbaIndex + 2] / 255;
  }

  return { frame, roi };
}

async function waitForVideo(videoElementId: string, signal: AbortSignal) {
  while (!signal.aborted) {
    const video = findReadyVideo(videoElementId);
    if (video) return video;
    await new Promise((resolve) => window.setTimeout(resolve, 100));
  }
  return null;
}

export function useRPPG(videoElementId: string, enabled: boolean, fps = DEFAULT_FPS) {
  const [bpm, setBpm] = useState<number>(0);
  const [confidence, setConfidence] = useState<number | null>(null);
  const [focusScore, setFocusScore] = useState<number | null>(null);
  const [focusRawScore, setFocusRawScore] = useState<number | null>(null);
  const [focusMetrics, setFocusMetrics] = useState<RppgFocusResponse | null>(null);
  const [status, setStatus] = useState('심박도 측정 준비 중');
  const [error, setError] = useState<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setBpm(0);
      setConfidence(null);
      setFocusScore(null);
      setFocusRawScore(null);
      setFocusMetrics(null);
      setError(null);
      setStatus('심박도 측정 비활성화');
      return;
    }

    const abortController = new AbortController();
    const canvas = document.createElement('canvas');
    let stopped = false;
    let timer: number | null = null;
    let requestInFlight = false;
    const frameIntervalMs = Math.max(1, 1000 / Math.max(fps, 1));
    let nextCaptureAt = 0;

    const cleanupSession = () => {
      const sessionId = sessionIdRef.current;
      if (!sessionId) return;
      sessionIdRef.current = null;
      void fetch('/api/rppg/session', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
        keepalive: true,
      }).catch(() => undefined);
    };

    const scheduleNext = () => {
      if (stopped || abortController.signal.aborted) return;
      const now = window.performance.now();
      if (nextCaptureAt <= 0 || nextCaptureAt < now) nextCaptureAt = now;
      timer = window.setTimeout(captureAndSend, Math.max(0, nextCaptureAt - now));
    };

    const captureAndSend = async () => {
      if (stopped || abortController.signal.aborted || requestInFlight) {
        scheduleNext();
        return;
      }

      const captureStartedAt = window.performance.now();
      if (nextCaptureAt <= 0 || nextCaptureAt < captureStartedAt) nextCaptureAt = captureStartedAt;
      nextCaptureAt += frameIntervalMs;

      requestInFlight = true;
      try {
        const video = findReadyVideo(videoElementId);
        if (!video) {
          setStatus('비디오 프레임 준비 중');
          return;
        }

        const { frame } = captureFacePhysFrame(video, canvas);
        setStatus((current) => (current.includes('samples') ? current : '심박도 신호 수집 중'));

        const response = await fetch('/api/rppg/frame', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: abortController.signal,
          body: JSON.stringify({
            sessionId: sessionIdRef.current,
            frame,
            dims: [TARGET_SIZE, TARGET_SIZE, CHANNELS],
            timestampMs: Date.now(),
            fps,
          }),
        });

        if (!response.ok) {
          const payload = await response.json().catch(() => null) as { error?: string } | null;
          throw new Error(payload?.error ?? 'FacePhys rPPG API 호출에 실패했습니다.');
        }

        const payload = await response.json() as FacePhysRppgResponse;
        sessionIdRef.current = payload.sessionId;
        setError(null);

        const focus = payload.focus ?? null;
        setFocusMetrics(focus);
        setFocusScore(focus?.score ?? null);
        setFocusRawScore(focus?.rawScore ?? null);

        if (payload.motionArtifact) {
          if (payload.ready && payload.bpm && payload.bpm >= 40 && payload.bpm <= 180) {
            setBpm(payload.bpm);
            setConfidence(payload.confidence);
          }
          setStatus(`움직임 감지 · 심박도 측정 유지 중 · ${payload.sampleCount} samples`);
        } else if (payload.ready && payload.bpm && payload.bpm >= 40 && payload.bpm <= 180) {
          setBpm(payload.bpm);
          setConfidence(payload.confidence);
          setStatus(`${payload.phase === 'preview' ? '심박도 보정 중' : '심박도 측정 중'} · ${payload.sampleCount} samples`);
        } else {
          setStatus(`심박도 신호 수집 중 · ${payload.sampleCount} samples`);
        }
      } catch (err) {
        if (!abortController.signal.aborted) {
          const message = err instanceof Error ? err.message : 'FacePhys rPPG 측정 중 오류가 발생했습니다.';
          setError(message);
          setFocusScore(null);
          setFocusRawScore(null);
          setFocusMetrics(null);
          setStatus('심박도 측정 오류');
          console.error('FacePhys rPPG 실행 실패:', err);
        }
      } finally {
        requestInFlight = false;
        scheduleNext();
      }
    };

    const start = async () => {
      setStatus('비디오 준비 중');
      const video = await waitForVideo(videoElementId, abortController.signal);
      if (!video || abortController.signal.aborted) {
        if (!abortController.signal.aborted) setStatus('비디오 태그를 찾지 못했습니다.');
        return;
      }

      setStatus('심박도 신호 수집 중');
      void captureAndSend();
    };

    void start();

    return () => {
      stopped = true;
      abortController.abort();
      if (timer != null) window.clearTimeout(timer);
      cleanupSession();
    };
  }, [videoElementId, enabled, fps]);

  return {
    bpm,
    confidence,
    focusScore,
    focusRawScore,
    focusMetrics,
    status,
    error,
  };
}
