import { useEffect, useRef, useState } from 'react';

const TARGET_SIZE = 36;
const CHANNELS = 3;
const DEFAULT_FPS = 15;
const STALE_VIDEO_MS = 2000;
const DUPLICATE_FRAME_DELTA = 0.00001;
const MIN_LUMA_MEAN = 0.03;
const MAX_LUMA_MEAN = 0.98;
const MIN_LUMA_STD = 0.01;
const FACE_DETECT_INTERVAL_MS = 900;
const FACE_DETECT_MISS_LIMIT = 4;

const STATUS = {
  disabled: '카메라 rPPG 비활성화',
  preparing: '카메라 준비 중',
  unavailable: '카메라를 사용할 수 없음',
  paused: '카메라 화면 정지',
  unusableFrame: '카메라 프레임 사용 불가',
  collecting: 'rPPG 신호 수집 중',
  calibrating: 'rPPG 보정 중',
  measuring: 'rPPG 측정 중',
  motion: '움직임 감지 - 측정 유지 중',
  error: 'rPPG 오류',
};

export function isRppgMeasuringStatus(status: string) {
  return [
    STATUS.collecting,
    STATUS.calibrating,
    STATUS.measuring,
    STATUS.motion,
  ].some((needle) => status.includes(needle));
}

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

interface CapturedFacePhysFrame {
  frame: number[];
  roi: RppgRoi;
  meanLuma: number;
  lumaStd: number;
}

interface DetectedFaceBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface DetectedFace {
  boundingBox: DOMRectReadOnly | Partial<DetectedFaceBox & {
    left: number;
    top: number;
    right: number;
    bottom: number;
  }>;
}

interface BrowserFaceDetector {
  detect(source: CanvasImageSource): Promise<DetectedFace[]>;
}

type BrowserFaceDetectorConstructor = new (options?: {
  fastMode?: boolean;
  maxDetectedFaces?: number;
}) => BrowserFaceDetector;

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

function fitRoiToVideo(roi: RppgRoi, videoWidth: number, videoHeight: number): RppgRoi {
  const width = clamp(Math.round(roi.width), 1, videoWidth);
  const height = clamp(Math.round(roi.height), 1, videoHeight);
  return {
    x: clamp(Math.round(roi.x), 0, Math.max(0, videoWidth - width)),
    y: clamp(Math.round(roi.y), 0, Math.max(0, videoHeight - height)),
    width,
    height,
  };
}

function roiChangeScore(previous: RppgRoi | null, next: RppgRoi) {
  if (!previous) return 1;

  const previousCenterX = previous.x + previous.width / 2;
  const previousCenterY = previous.y + previous.height / 2;
  const nextCenterX = next.x + next.width / 2;
  const nextCenterY = next.y + next.height / 2;
  const referenceSize = Math.max(previous.width, previous.height, next.width, next.height, 1);
  const centerShift = Math.hypot(nextCenterX - previousCenterX, nextCenterY - previousCenterY) / referenceSize;
  const sizeShift = Math.abs(Math.log(Math.max(next.width, next.height, 1) / Math.max(previous.width, previous.height, 1)));

  return Math.max(centerShift, sizeShift);
}

function smoothRoi(previous: RppgRoi | null, next: RppgRoi, video: HTMLVideoElement): RppgRoi {
  const videoWidth = video.videoWidth || video.clientWidth || 1;
  const videoHeight = video.videoHeight || video.clientHeight || 1;
  if (!previous || roiChangeScore(previous, next) > 0.55) {
    return fitRoiToVideo(next, videoWidth, videoHeight);
  }

  const alpha = 0.72;
  return fitRoiToVideo({
    x: previous.x * alpha + next.x * (1 - alpha),
    y: previous.y * alpha + next.y * (1 - alpha),
    width: previous.width * alpha + next.width * (1 - alpha),
    height: previous.height * alpha + next.height * (1 - alpha),
  }, videoWidth, videoHeight);
}

function boxFromDetectedFace(face: DetectedFace): DetectedFaceBox | null {
  const box = face.boundingBox;
  const x = Number('x' in box ? box.x : box.left);
  const y = Number('y' in box ? box.y : box.top);
  const width = Number('width' in box ? box.width : Number(box.right) - x);
  const height = Number('height' in box ? box.height : Number(box.bottom) - y);

  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null;
  return { x, y, width, height };
}

function roiFromFaceBox(face: DetectedFaceBox, video: HTMLVideoElement): RppgRoi | null {
  const videoWidth = video.videoWidth || video.clientWidth || 1;
  const videoHeight = video.videoHeight || video.clientHeight || 1;
  const minVideoSide = Math.min(videoWidth, videoHeight);

  if (face.width < minVideoSide * 0.12 || face.height < minVideoSide * 0.12) return null;

  const size = clamp(
    Math.max(face.width * 1.16, face.height * 0.92),
    minVideoSide * 0.24,
    minVideoSide * 0.84,
  );
  const centerX = face.x + face.width * 0.5;
  const centerY = face.y + face.height * 0.44;

  return fitRoiToVideo({
    x: centerX - size / 2,
    y: centerY - size / 2,
    width: size,
    height: size,
  }, videoWidth, videoHeight);
}

function createFaceDetector() {
  const detectorConstructor = (window as Window & {
    FaceDetector?: BrowserFaceDetectorConstructor;
  }).FaceDetector;

  if (!detectorConstructor) return null;

  try {
    return new detectorConstructor({ fastMode: true, maxDetectedFaces: 1 });
  } catch {
    return null;
  }
}

async function detectFaceRoi(video: HTMLVideoElement, detector: BrowserFaceDetector) {
  const faces = await detector.detect(video);
  const boxes = faces
    .map(boxFromDetectedFace)
    .filter((box): box is DetectedFaceBox => box != null)
    .sort((left, right) => (right.width * right.height) - (left.width * left.height));

  return boxes.length > 0 ? roiFromFaceBox(boxes[0], video) : null;
}

function isVisibleVideo(video: HTMLVideoElement) {
  if (!video.isConnected) return false;

  const rect = video.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return false;

  const style = window.getComputedStyle(video);
  return style.display !== 'none'
    && style.visibility !== 'hidden'
    && style.opacity !== '0';
}

function hasLiveVideoTrack(video: HTMLVideoElement) {
  const stream = video.srcObject;
  if (!(stream instanceof MediaStream)) return false;

  return stream.active && stream.getVideoTracks().some((track) => (
    track.readyState === 'live' && track.enabled && !track.muted
  ));
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
  return video.readyState >= 2
    && video.videoWidth > 0
    && video.videoHeight > 0
    && !video.paused
    && !video.ended
    && isVisibleVideo(video)
    && hasLiveVideoTrack(video);
}

function findReadyVideo(videoElementId: string) {
  return getVideoCandidates(videoElementId).find(isVideoReady) ?? null;
}

function captureFacePhysFrame(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  roi = defaultFaceRoi(video),
): CapturedFacePhysFrame {
  canvas.width = TARGET_SIZE;
  canvas.height = TARGET_SIZE;

  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Canvas 2D context is unavailable.');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';

  context.drawImage(video, roi.x, roi.y, roi.width, roi.height, 0, 0, TARGET_SIZE, TARGET_SIZE);
  const rgba = context.getImageData(0, 0, TARGET_SIZE, TARGET_SIZE).data;
  const frame = new Array<number>(TARGET_SIZE * TARGET_SIZE * CHANNELS);
  let lumaSum = 0;
  let lumaSquareSum = 0;

  for (let rgbaIndex = 0, rgbIndex = 0; rgbaIndex < rgba.length; rgbaIndex += 4, rgbIndex += 3) {
    const red = rgba[rgbaIndex] / 255;
    const green = rgba[rgbaIndex + 1] / 255;
    const blue = rgba[rgbaIndex + 2] / 255;
    const luma = 0.299 * red + 0.587 * green + 0.114 * blue;

    frame[rgbIndex] = red;
    frame[rgbIndex + 1] = green;
    frame[rgbIndex + 2] = blue;
    lumaSum += luma;
    lumaSquareSum += luma * luma;
  }

  const pixelCount = TARGET_SIZE * TARGET_SIZE;
  const meanLuma = lumaSum / pixelCount;
  const variance = Math.max(0, (lumaSquareSum / pixelCount) - meanLuma * meanLuma);

  return {
    frame,
    roi,
    meanLuma,
    lumaStd: Math.sqrt(variance),
  };
}

function isUsableFrame({ meanLuma, lumaStd }: CapturedFacePhysFrame) {
  return meanLuma >= MIN_LUMA_MEAN
    && meanLuma <= MAX_LUMA_MEAN
    && lumaStd >= MIN_LUMA_STD;
}

function meanAbsoluteFrameDelta(current: number[], previous: number[] | null) {
  if (!previous || previous.length !== current.length) return Infinity;

  let total = 0;
  for (let index = 0; index < current.length; index += 1) {
    total += Math.abs(current[index] - previous[index]);
  }

  return total / current.length;
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
  const [waveformValue, setWaveformValue] = useState<number | null>(null);
  const [status, setStatus] = useState(STATUS.preparing);
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
      setStatus(STATUS.disabled);
      return;
    }

    const abortController = new AbortController();
    const canvas = document.createElement('canvas');
    let stopped = false;
    let timer: number | null = null;
    let requestInFlight = false;
    const frameIntervalMs = Math.max(1, 1000 / Math.max(fps, 1));
    const duplicateFrameLimit = Math.max(8, Math.round(fps * 2));
    let nextCaptureAt = 0;
    let lastVideoTime = -1;
    let staleVideoStartedAt: number | null = null;
    let previousFrame: number[] | null = null;
    let duplicateFrameCount = 0;
    let faceDetector = createFaceDetector();
    let trackedRoi: RppgRoi | null = null;
    let lastFaceDetectAt = -Infinity;
    let missedFaceDetections = 0;
    let resetNextFrame = false;

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

    const clearMeasurements = (nextStatus: string, resetFrameHistory = false) => {
      setBpm(0);
      setConfidence(null);
      setFocusScore(null);
      setFocusRawScore(null);
      setFocusMetrics(null);
      setWaveformValue(null);
      setError(null);
      setStatus(nextStatus);
      cleanupSession();

      if (resetFrameHistory) {
        previousFrame = null;
        duplicateFrameCount = 0;
        lastVideoTime = -1;
        staleVideoStartedAt = null;
        trackedRoi = null;
        missedFaceDetections = 0;
        resetNextFrame = false;
      }
    };

    const isVideoAdvancing = (video: HTMLVideoElement, now: number) => {
      const currentTime = video.currentTime;
      if (!Number.isFinite(currentTime)) return true;

      if (lastVideoTime < 0 || currentTime > lastVideoTime + 0.001) {
        lastVideoTime = currentTime;
        staleVideoStartedAt = null;
        return true;
      }

      staleVideoStartedAt ??= now;
      return now - staleVideoStartedAt < STALE_VIDEO_MS;
    };

    const hasFreshFrame = (frame: number[]) => {
      const delta = meanAbsoluteFrameDelta(frame, previousFrame);
      previousFrame = frame;

      if (delta <= DUPLICATE_FRAME_DELTA) {
        duplicateFrameCount += 1;
      } else {
        duplicateFrameCount = 0;
      }

      return duplicateFrameCount < duplicateFrameLimit;
    };

    const resolveCaptureRoi = async (video: HTMLVideoElement, now: number) => {
      if (!faceDetector || now - lastFaceDetectAt < FACE_DETECT_INTERVAL_MS) {
        return trackedRoi ?? defaultFaceRoi(video);
      }

      lastFaceDetectAt = now;

      try {
        const detectedRoi = await detectFaceRoi(video, faceDetector);
        if (!detectedRoi) {
          missedFaceDetections += 1;
          if (missedFaceDetections >= FACE_DETECT_MISS_LIMIT) trackedRoi = null;
          return trackedRoi ?? defaultFaceRoi(video);
        }

        const changeScore = roiChangeScore(trackedRoi, detectedRoi);
        if (trackedRoi && changeScore > 0.55) {
          previousFrame = null;
          duplicateFrameCount = 0;
          resetNextFrame = true;
        }

        missedFaceDetections = 0;
        trackedRoi = smoothRoi(trackedRoi, detectedRoi, video);
        return trackedRoi;
      } catch {
        faceDetector = null;
        trackedRoi = null;
        return defaultFaceRoi(video);
      }
    };

    const scheduleNext = () => {
      if (stopped || abortController.signal.aborted) return;
      const now = window.performance.now();
      if (nextCaptureAt <= 0 || nextCaptureAt < now) nextCaptureAt = now;
      timer = window.setTimeout(captureAndSend, Math.max(0, nextCaptureAt - now));
    };

    const captureAndSend = async () => {
      if (stopped || abortController.signal.aborted) return;
      if (requestInFlight) return;

      const captureStartedAt = window.performance.now();
      if (nextCaptureAt <= 0 || nextCaptureAt < captureStartedAt) nextCaptureAt = captureStartedAt;
      nextCaptureAt += frameIntervalMs;

      requestInFlight = true;
      try {
        const video = findReadyVideo(videoElementId);
        if (!video) {
          clearMeasurements(STATUS.unavailable, true);
          return;
        }

        if (!isVideoAdvancing(video, captureStartedAt)) {
          clearMeasurements(STATUS.paused);
          return;
        }

        const roi = await resolveCaptureRoi(video, captureStartedAt);
        const capture = captureFacePhysFrame(video, canvas, roi);
        if (!isUsableFrame(capture)) {
          clearMeasurements(STATUS.unusableFrame, true);
          return;
        }

        if (!hasFreshFrame(capture.frame)) {
          clearMeasurements(STATUS.paused);
          return;
        }

        setStatus((current) => (current.includes('samples') ? current : STATUS.collecting));

        const shouldResetSession = resetNextFrame;
        resetNextFrame = false;

        const response = await fetch('/api/rppg/frame', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: abortController.signal,
          body: JSON.stringify({
            sessionId: sessionIdRef.current,
            frame: capture.frame,
            dims: [TARGET_SIZE, TARGET_SIZE, CHANNELS],
            timestampMs: Date.now(),
            fps,
            reset: shouldResetSession,
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
          setStatus(`${STATUS.motion} - ${payload.sampleCount} samples`);
        } else if (payload.ready && payload.bpm && payload.bpm >= 40 && payload.bpm <= 180) {
          setBpm(payload.bpm);
          setConfidence(payload.confidence);
          setStatus(`${payload.phase === 'preview' ? STATUS.calibrating : STATUS.measuring} - ${payload.sampleCount} samples`);
        } else {
          setStatus(`${STATUS.collecting} - ${payload.sampleCount} samples`);
        }
      } catch (err) {
        if (!abortController.signal.aborted) {
          const message = err instanceof Error ? err.message : 'FacePhys rPPG 측정 중 오류가 발생했습니다.';
          setError(message);
          setBpm(0);
          setConfidence(null);
          setFocusScore(null);
          setFocusRawScore(null);
          setFocusMetrics(null);
          setWaveformValue(null);
          setStatus(STATUS.error);
          cleanupSession();
          console.error('FacePhys rPPG 실행 실패:', err);
        }
      } finally {
        requestInFlight = false;
        scheduleNext();
      }
    };

    const start = async () => {
      setStatus(STATUS.preparing);
      const video = await waitForVideo(videoElementId, abortController.signal);
      if (!video || abortController.signal.aborted) {
        if (!abortController.signal.aborted) clearMeasurements(STATUS.unavailable, true);
        return;
      }

      setStatus(STATUS.collecting);
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
