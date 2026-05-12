import path from 'node:path';
import { FacePhysOnnx, type FacePhysFrameInput } from './core';
import { loadStateGzip } from './io';
import { cloneState, type FacePhysState } from './state';
import {
  estimateRppgFocus,
  RollingBpmEstimator,
  type BpmEstimate,
  type RppgFocusEstimate,
  type TimestampedSample,
} from './rppg';

const TARGET_SIZE = 36;
const CHANNELS = 3;
const FRAME_LENGTH = TARGET_SIZE * TARGET_SIZE * CHANNELS;
const SESSION_TTL_MS = 5 * 60 * 1000;
const DEFAULT_FPS = 15;
const FOCUS_WINDOW_SECONDS = 60;

interface OrtRuntime {
  Tensor: new (type: 'float32', data: Float32Array, dims: number[]) => unknown;
  InferenceSession: {
    create(modelPath: string, options?: Record<string, unknown>): Promise<unknown>;
  };
}

interface FacePhysRuntime {
  model: FacePhysOnnx;
  initialState: FacePhysState;
}

interface RppgSession {
  id: string;
  state: FacePhysState;
  estimator: RollingBpmEstimator;
  focusSamples: Required<Pick<TimestampedSample, 'value' | 'timeMs'>>[];
  fps: number;
  frameIndex: number;
  lastFrameTimeMs: number | null;
  signalTimeMs: number;
  previousFrame: Float32Array | null;
  motionCooldownFrames: number;
  lastMotionScore: number | null;
  lastMotionQuality: number;
  createdAt: number;
  updatedAt: number;
}

export interface RppgFrameRequest {
  sessionId?: string;
  frame: ArrayLike<number>;
  dims?: number[];
  timestampMs?: number;
  fps?: number;
  reset?: boolean;
}

export interface RppgFrameResult {
  sessionId: string;
  frameIndex: number;
  waveformValue: number;
  bpm: number | null;
  rawBpm: number | null;
  confidence: number | null;
  phase: 'collecting' | 'preview' | 'stable';
  motionScore: number | null;
  motionQuality: number;
  motionArtifact: boolean;
  sampleCount: number;
  durationSeconds: number;
  focus: RppgFocusEstimate | null;
  inferenceMs: number;
  dt: number;
  ready: boolean;
}

let runtimePromise: Promise<FacePhysRuntime> | null = null;
const sessions = new Map<string, RppgSession>();

function makeSessionId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `rppg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function motionQualityFromScore(score: number | null) {
  if (score == null) return 1;
  const lowMotion = 0.025;
  const highMotion = 0.12;
  return 1 - clamp((score - lowMotion) / (highMotion - lowMotion), 0, 1);
}

function frameMotionScore(current: ArrayLike<number>, previous: ArrayLike<number> | null) {
  if (!previous || previous.length !== current.length) return null;

  const pixelCount = Math.floor(current.length / CHANNELS);
  if (pixelCount <= 0) return null;

  let meanLumaDelta = 0;
  for (let index = 0; index < current.length; index += CHANNELS) {
    const currentLuma = 0.299 * current[index] + 0.587 * current[index + 1] + 0.114 * current[index + 2];
    const previousLuma = 0.299 * previous[index] + 0.587 * previous[index + 1] + 0.114 * previous[index + 2];
    meanLumaDelta += currentLuma - previousLuma;
  }
  meanLumaDelta /= pixelCount;

  let residualMotion = 0;
  for (let index = 0; index < current.length; index += CHANNELS) {
    const currentLuma = 0.299 * current[index] + 0.587 * current[index + 1] + 0.114 * current[index + 2];
    const previousLuma = 0.299 * previous[index] + 0.587 * previous[index + 1] + 0.114 * previous[index + 2];
    residualMotion += Math.abs((currentLuma - previousLuma) - meanLumaDelta);
  }

  return residualMotion / pixelCount;
}

async function loadOrtRuntime(): Promise<OrtRuntime> {
  const imported = await import('onnxruntime-node');
  const candidate = (imported as unknown as { default?: OrtRuntime }).default ?? imported;
  const ort = candidate as OrtRuntime;
  if (!ort?.InferenceSession?.create || !ort?.Tensor) {
    throw new Error('onnxruntime-node did not expose InferenceSession and Tensor.');
  }
  return ort;
}

async function loadRuntime(): Promise<FacePhysRuntime> {
  if (!runtimePromise) {
    runtimePromise = (async () => {
      const weightsDir = path.join(process.cwd(), 'facephys', 'weights');
      const modelPath = path.join(weightsDir, 'model.onnx');
      const statePath = path.join(weightsDir, 'state.gz');
      const ort = await loadOrtRuntime();
      const session = await ort.InferenceSession.create(modelPath, { executionProviders: ['cpu'] });
      const model = new FacePhysOnnx(session as ConstructorParameters<typeof FacePhysOnnx>[0], ort as ConstructorParameters<typeof FacePhysOnnx>[1]);
      const initialState = loadStateGzip(statePath);
      return { model, initialState };
    })();
  }

  return runtimePromise;
}

function cleanStaleSessions(now = Date.now()) {
  for (const [id, session] of sessions) {
    if (now - session.updatedAt > SESSION_TTL_MS) sessions.delete(id);
  }
}

function normalizedFps(fps: unknown) {
  const value = Number(fps ?? DEFAULT_FPS);
  return Number.isFinite(value) && value >= 5 && value <= 30 ? value : DEFAULT_FPS;
}

function makeEstimator(fps: number) {
  return new RollingBpmEstimator({
    fps,
    windowSeconds: 14,
    minBpm: 45,
    maxBpm: 180,
    minSamples: Math.max(60, Math.round(fps * 5)),
    minDurationSeconds: 5,
    previewMinSamples: Math.max(24, Math.round(fps * 1.8)),
    previewMinDurationSeconds: 1.8,
    previewMaxBpm: 135,
    previewMinConfidence: 0,
    smoothing: 0.72,
    minConfidence: 0.18,
    minSampleQuality: 0.2,
    maxBpmDelta: 8,
  });
}

async function createSession(id: string | undefined, fps: number): Promise<RppgSession> {
  const runtime = await loadRuntime();
  const now = Date.now();
  const session: RppgSession = {
    id: id || makeSessionId(),
    state: cloneState(runtime.initialState),
    estimator: makeEstimator(fps),
    focusSamples: [],
    fps,
    frameIndex: 0,
    lastFrameTimeMs: null,
    signalTimeMs: 0,
    previousFrame: null,
    motionCooldownFrames: 0,
    lastMotionScore: null,
    lastMotionQuality: 1,
    createdAt: now,
    updatedAt: now,
  };
  sessions.set(session.id, session);
  return session;
}

export async function startRppgSession({ sessionId, fps }: { sessionId?: string; fps?: number } = {}) {
  cleanStaleSessions();
  return createSession(sessionId, normalizedFps(fps));
}

export function deleteRppgSession(sessionId: string) {
  return sessions.delete(sessionId);
}

function validateAndNormalizeFrame(frame: ArrayLike<number>, dims?: number[]): FacePhysFrameInput {
  const shape = Array.isArray(dims) && dims.length === 3 ? dims.map(Number) : [TARGET_SIZE, TARGET_SIZE, CHANNELS];
  if (shape[0] !== TARGET_SIZE || shape[1] !== TARGET_SIZE || shape[2] !== CHANNELS) {
    throw new Error(`FacePhys backend expects dims [${TARGET_SIZE}, ${TARGET_SIZE}, ${CHANNELS}].`);
  }

  if (!frame || typeof frame.length !== 'number') {
    throw new Error('frame must be an array-like RGB float payload.');
  }

  if (frame.length !== FRAME_LENGTH) {
    throw new Error(`frame length must be ${FRAME_LENGTH}; received ${frame.length}.`);
  }

  const data = new Float32Array(FRAME_LENGTH);
  for (let index = 0; index < FRAME_LENGTH; index += 1) {
    const value = Number(frame[index]);
    data[index] = Number.isFinite(value) ? clamp(value, 0, 1) : 0;
  }

  return { data, dims: shape };
}

function estimatorStats(estimator: RollingBpmEstimator) {
  const sampleCount = estimator.samples.length;
  const firstSample = estimator.samples[0];
  const lastSample = estimator.samples[sampleCount - 1];
  const durationSeconds = firstSample && lastSample
    ? Math.max(0, (lastSample.timeMs - firstSample.timeMs) / 1000)
    : 0;

  return {
    sampleCount,
    durationSeconds: Number(durationSeconds.toFixed(2)),
  };
}

function addFocusSample(session: RppgSession, value: number, timeMs: number, quality: number) {
  if (quality >= 0.2 && Number.isFinite(value) && Number.isFinite(timeMs)) {
    session.focusSamples.push({ value, timeMs });
  }

  const cutoffMs = timeMs - FOCUS_WINDOW_SECONDS * 1000;
  while (session.focusSamples.length > 0 && session.focusSamples[0].timeMs < cutoffMs) {
    session.focusSamples.shift();
  }
}

function serializeBpm(bpm: BpmEstimate | null, fallbackStats: ReturnType<typeof estimatorStats>) {
  if (!bpm) {
    return {
      bpm: null,
      rawBpm: null,
      confidence: null,
      phase: 'collecting' as const,
      motionScore: null,
      motionQuality: 1,
      motionArtifact: false,
      sampleCount: fallbackStats.sampleCount,
      durationSeconds: fallbackStats.durationSeconds,
      ready: false,
    };
  }

  return {
    bpm: Math.round(bpm.bpm),
    rawBpm: bpm.rawBpm == null ? null : Math.round(bpm.rawBpm),
    confidence: Number(bpm.confidence.toFixed(3)),
    phase: bpm.phase,
    motionScore: null,
    motionQuality: 1,
    motionArtifact: false,
    sampleCount: bpm.sampleCount,
    durationSeconds: Number(bpm.durationSeconds.toFixed(2)),
    ready: true,
  };
}

export async function runRppgFrame(request: RppgFrameRequest): Promise<RppgFrameResult> {
  cleanStaleSessions();

  const fps = normalizedFps(request.fps);
  const session = request.reset || !request.sessionId || !sessions.has(request.sessionId)
    ? await createSession(request.sessionId, fps)
    : sessions.get(request.sessionId)!;

  const timestampMs = Number.isFinite(Number(request.timestampMs)) ? Number(request.timestampMs) : Date.now();
  const dt = session.lastFrameTimeMs == null
    ? 1 / session.fps
    : clamp((timestampMs - session.lastFrameTimeMs) / 1000, 1 / 120, 0.25);
  session.lastFrameTimeMs = timestampMs;
  session.updatedAt = Date.now();

  const frame = validateAndNormalizeFrame(request.frame, request.dims);
  const motionScore = frameMotionScore(frame.data, session.previousFrame);
  const motionQuality = motionQualityFromScore(motionScore);
  if (motionQuality < 0.15) {
    session.motionCooldownFrames = Math.max(session.motionCooldownFrames, Math.round(session.fps * 0.25));
  }
  const isWarmingUp = session.estimator.samples.length < Math.max(12, Math.round(session.fps * 1.2));
  const motionArtifact = !isWarmingUp && (motionQuality < 0.15 || session.motionCooldownFrames > 0);
  const sampleQuality = motionArtifact ? Math.min(motionQuality, 0.1) : Math.max(motionQuality, isWarmingUp ? 0.45 : 0);
  if (session.motionCooldownFrames > 0) session.motionCooldownFrames -= 1;
  session.previousFrame = Float32Array.from(frame.data);
  session.lastMotionScore = motionScore;
  session.lastMotionQuality = motionQuality;

  const { model } = await loadRuntime();
  const startedAt = Date.now();
  const result = await model.runFrame(frame, session.state, { dt });
  session.state = result.state;

  session.signalTimeMs += dt * 1000;
  const bpm = session.estimator.add(result.value, session.signalTimeMs, sampleQuality);
  addFocusSample(session, result.value, session.signalTimeMs, sampleQuality);
  const focus = estimateRppgFocus(session.focusSamples, {
    fps: session.fps,
    minSamples: Math.max(90, Math.round(session.fps * 8)),
    minDurationSeconds: 15,
  });
  const stats = estimatorStats(session.estimator);
  const frameIndex = session.frameIndex;
  session.frameIndex += 1;

  return {
    sessionId: session.id,
    frameIndex,
    waveformValue: Number(result.value),
    ...serializeBpm(bpm, stats),
    motionScore: motionScore == null ? null : Number(motionScore.toFixed(4)),
    motionQuality: Number(motionQuality.toFixed(3)),
    motionArtifact,
    focus,
    inferenceMs: Date.now() - startedAt,
    dt,
  };
}
