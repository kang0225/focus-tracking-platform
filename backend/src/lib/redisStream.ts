import net from 'node:net';

const DEFAULT_REDIS_HOST = '10.0.11.0';
const DEFAULT_REDIS_PORT = 6379;
const DEFAULT_RECORD_TTL_SECONDS = 60 * 60 * 24;
const DEFAULT_ML_SERVICE_URL = 'http://ml-service:8000';

interface RedisCommand {
  args: string[];
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}

let socket: net.Socket | null = null;
let connected = false;
let connecting: Promise<void> | null = null;
let buffer = Buffer.alloc(0);
let activeCommand: RedisCommand | null = null;
const queue: RedisCommand[] = [];

function getRedisConfig() {
  const rawHost = (process.env.REDIS_HOST || DEFAULT_REDIS_HOST).trim();
  const host = rawHost.includes('/') ? rawHost.split('/')[0] : rawHost;
  const port = Number(process.env.REDIS_PORT ?? DEFAULT_REDIS_PORT);

  return {
    host,
    port: Number.isFinite(port) ? port : DEFAULT_REDIS_PORT,
  };
}

function encodeCommand(args: string[]) {
  const parts = [`*${args.length}\r\n`];
  for (const arg of args) {
    parts.push(`$${Buffer.byteLength(arg)}\r\n${arg}\r\n`);
  }
  return parts.join('');
}

function readLine(input: Buffer, offset: number) {
  const end = input.indexOf('\r\n', offset);
  if (end === -1) return null;
  return {
    line: input.subarray(offset, end).toString('utf8'),
    nextOffset: end + 2,
  };
}

function parseRedisReply(input: Buffer, offset = 0): { value: unknown; nextOffset: number } | null {
  if (offset >= input.length) return null;

  const type = String.fromCharCode(input[offset]);
  const line = readLine(input, offset + 1);
  if (!line) return null;

  if (type === '+') return { value: line.line, nextOffset: line.nextOffset };
  if (type === ':') return { value: Number(line.line), nextOffset: line.nextOffset };
  if (type === '-') throw new Error(line.line);

  if (type === '$') {
    const length = Number(line.line);
    if (length === -1) return { value: null, nextOffset: line.nextOffset };
    const valueStart = line.nextOffset;
    const valueEnd = valueStart + length;
    if (input.length < valueEnd + 2) return null;
    return {
      value: input.subarray(valueStart, valueEnd).toString('utf8'),
      nextOffset: valueEnd + 2,
    };
  }

  if (type === '*') {
    const length = Number(line.line);
    if (length === -1) return { value: null, nextOffset: line.nextOffset };

    const values: unknown[] = [];
    let nextOffset = line.nextOffset;
    for (let index = 0; index < length; index += 1) {
      const item = parseRedisReply(input, nextOffset);
      if (!item) return null;
      values.push(item.value);
      nextOffset = item.nextOffset;
    }

    return { value: values, nextOffset };
  }

  throw new Error(`Unsupported Redis response type: ${type}`);
}

function failPending(error: Error) {
  activeCommand?.reject(error);
  activeCommand = null;

  while (queue.length > 0) {
    queue.shift()?.reject(error);
  }
}

function closeSocket() {
  connected = false;
  connecting = null;
  socket?.destroy();
  socket = null;
  buffer = Buffer.alloc(0);
}

function flushQueue() {
  if (!socket || !connected || activeCommand || queue.length === 0) return;

  activeCommand = queue.shift() ?? null;
  if (!activeCommand) return;

  socket.write(encodeCommand(activeCommand.args));
}

function handleData(chunk: Buffer) {
  buffer = Buffer.concat([buffer, chunk]);

  while (activeCommand) {
    let parsed: { value: unknown; nextOffset: number } | null = null;
    try {
      parsed = parseRedisReply(buffer);
    } catch (error) {
      const failure = error instanceof Error ? error : new Error('Redis command failed.');
      activeCommand.reject(failure);
      activeCommand = null;
      buffer = Buffer.alloc(0);
      closeSocket();
      return;
    }

    if (!parsed) return;

    const command = activeCommand;
    activeCommand = null;
    buffer = buffer.subarray(parsed.nextOffset);
    command.resolve(parsed.value);
    flushQueue();
  }
}

function connectRedis() {
  if (connected && socket) return Promise.resolve();
  if (connecting) return connecting;

  connecting = new Promise<void>((resolve, reject) => {
    const { host, port } = getRedisConfig();
    const nextSocket = net.createConnection({ host, port });
    socket = nextSocket;
    let hasConnected = false;

    const failConnect = (error: Error) => {
      if (hasConnected) {
        closeSocket();
        failPending(error);
        return;
      }
      closeSocket();
      reject(error);
    };

    nextSocket.once('connect', () => {
      hasConnected = true;
      connected = true;
      connecting = null;
      resolve();
      flushQueue();
    });

    nextSocket.on('error', failConnect);
    nextSocket.on('data', handleData);
    nextSocket.on('close', () => {
      const error = new Error('Redis connection closed.');
      closeSocket();
      failPending(error);
    });
    nextSocket.setTimeout(5_000, () => {
      const error = new Error('Redis connection timed out.');
      closeSocket();
      failPending(error);
      reject(error);
    });
  });

  return connecting;
}

export async function sendRedisCommand(args: string[]) {
  await connectRedis();

  return new Promise((resolve, reject) => {
    queue.push({ args, resolve, reject });
    flushQueue();
  });
}

export interface TrackingStreamPayload {
  meetingId: string;
  userId: string;
  timestamp: string;
  heartRate: number;
  heartRateSource: string;
  heartRateStatus?: string;
  gaze: {
    x: number;
    y: number;
    rawX?: number;
    rawY?: number;
    calibrated: boolean;
  };
  focusScore?: number;
  focusIsFocused?: boolean | null;
  focusThresholdRawScore?: number | null;
  rPPG?: number | null;
  threshold?: number | null;
  page?: 'solo' | 'room';
}

export interface TrackingRecordPayload {
  timestamp: string;
  userId: string;
  sessionId: string;
  gazeX: number;
  gazeY: number;
  heartRate: number;
  rPPG: number | null;
  threshold: number | null;
}

function getTrackingRecordsKey(userId: string, sessionId: string) {
  return `study:session:${userId}:${sessionId}:records`;
}

function toKstIsoString(value: string) {
  const date = new Date(value);
  const source = Number.isNaN(date.getTime()) ? new Date() : date;
  const offsetMinutes = 9 * 60;
  const shifted = new Date(source.getTime() + offsetMinutes * 60 * 1000);
  return `${shifted.toISOString().slice(0, 19)}+09:00`;
}

function finiteNumber(value: unknown, fallback: number | null = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export async function appendTrackingStream(payload: TrackingStreamPayload) {
  const sessionId = payload.meetingId;
  const key = getTrackingRecordsKey(payload.userId, sessionId);
  const record: TrackingRecordPayload = {
    timestamp: toKstIsoString(payload.timestamp),
    userId: payload.userId,
    sessionId,
    gazeX: payload.gaze.x,
    gazeY: payload.gaze.y,
    heartRate: payload.heartRate,
    rPPG: finiteNumber(payload.rPPG),
    threshold: finiteNumber(payload.threshold ?? payload.focusThresholdRawScore),
  };

  const length = await sendRedisCommand(['RPUSH', key, JSON.stringify(record)]);
  await sendRedisCommand(['EXPIRE', key, String(DEFAULT_RECORD_TTL_SECONDS)]);

  return { key, length };
}

export interface TrackingAnalysisJobRequest {
  meetingId: string;
  userId: string;
  page: 'solo' | 'room';
  reason: 'finish' | 'leave';
  requestedAt: string;
}

export interface TrackingAnalysisJobStatus {
  jobId: string;
  meetingId: string;
  userId: string;
  page: 'solo' | 'room';
  reason: 'finish' | 'leave';
  status: 'queued' | 'processing' | 'completed' | 'failed';
  requestedAt: string;
  result?: {
    durationSeconds?: number;
    avgBpm?: number;
    focusRatio?: number;
    summary?: string;
  };
  error?: string;
}

interface MlAnalyzeResponse {
  duration_minutes?: number;
  summary?: string | {
    high_focus_minutes?: number;
    [key: string]: unknown;
  };
  minutes?: Array<{
    heartRate_mean?: number | null;
    [key: string]: unknown;
  }>;
}

function makeJobId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `job-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export async function createTrackingAnalysisJob(request: TrackingAnalysisJobRequest) {
  const jobId = makeJobId();
  const statusKey = `tracking:job:${jobId}:status`;
  const trackingRecordsKey = getTrackingRecordsKey(request.userId, request.meetingId);
  const status: TrackingAnalysisJobStatus = {
    jobId,
    meetingId: request.meetingId,
    userId: request.userId,
    page: request.page,
    reason: request.reason,
    status: 'queued',
    requestedAt: request.requestedAt,
  };

  await sendRedisCommand([
    'SET',
    statusKey,
    JSON.stringify(status),
    'EX',
    String(60 * 60 * 24),
  ]);

  const processingStatus: TrackingAnalysisJobStatus = {
    ...status,
    status: 'processing',
  };
  await setTrackingAnalysisJobStatus(statusKey, processingStatus);

  try {
    const recordCount = await sendRedisCommand(['LLEN', trackingRecordsKey]);
    if (typeof recordCount !== 'number' || recordCount <= 0) {
      throw new Error('분석할 tracking 데이터가 Redis에 없습니다.');
    }

    const mlServiceUrl = (process.env.ML_SERVICE_URL || DEFAULT_ML_SERVICE_URL).replace(/\/$/, '');
    const response = await fetch(`${mlServiceUrl}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: request.userId,
        sessionId: request.meetingId,
        delete_after: false,
      }),
    });

    const payload = await response.json().catch(() => null) as MlAnalyzeResponse | { detail?: string; error?: string } | null;
    if (!response.ok) {
      const message = payload && 'detail' in payload
        ? payload.detail
        : payload && 'error' in payload
          ? payload.error
          : 'ML 분석 요청에 실패했습니다.';
      throw new Error(message);
    }

    const completedStatus: TrackingAnalysisJobStatus = {
      ...processingStatus,
      status: 'completed',
      result: mapMlAnalyzeResult(payload as MlAnalyzeResponse),
    };
    await setTrackingAnalysisJobStatus(statusKey, completedStatus);
  } catch (error) {
    const failedStatus: TrackingAnalysisJobStatus = {
      ...processingStatus,
      status: 'failed',
      error: error instanceof Error ? error.message : 'ML 분석 요청에 실패했습니다.',
    };
    await setTrackingAnalysisJobStatus(statusKey, failedStatus);
  }

  return {
    jobId,
    statusKey,
    trackingRecordsKey,
  };
}

async function setTrackingAnalysisJobStatus(statusKey: string, status: TrackingAnalysisJobStatus) {
  await sendRedisCommand([
    'SET',
    statusKey,
    JSON.stringify(status),
    'EX',
    String(60 * 60 * 24),
  ]);
}

function mapMlAnalyzeResult(payload: MlAnalyzeResponse | null): NonNullable<TrackingAnalysisJobStatus['result']> {
  const durationMinutes = Math.max(0, finiteNumber(payload?.duration_minutes, 0) ?? 0);
  const heartRates = (payload?.minutes ?? [])
    .map((minute) => finiteNumber(minute.heartRate_mean))
    .filter((value): value is number => value != null && value > 0);
  const avgBpm = heartRates.length > 0
    ? Math.round(heartRates.reduce((sum, value) => sum + value, 0) / heartRates.length)
    : 0;
  const highFocusMinutes = typeof payload?.summary === 'object'
    ? finiteNumber(payload.summary.high_focus_minutes, 0) ?? 0
    : 0;
  const focusRatio = durationMinutes > 0
    ? Math.max(0, Math.min(100, Math.round((highFocusMinutes / durationMinutes) * 100)))
    : 0;
  const summary = typeof payload?.summary === 'string'
    ? payload.summary
    : payload?.summary
      ? JSON.stringify(payload.summary)
      : undefined;

  return {
    durationSeconds: Math.round(durationMinutes * 60),
    avgBpm,
    focusRatio,
    summary,
  };
}

export async function getTrackingAnalysisJobStatus(jobId: string) {
  const value = await sendRedisCommand(['GET', `tracking:job:${jobId}:status`]);
  if (typeof value !== 'string') return null;

  try {
    return JSON.parse(value) as TrackingAnalysisJobStatus;
  } catch {
    return null;
  }
}
