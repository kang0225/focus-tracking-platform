import net from 'node:net';

const DEFAULT_REDIS_HOST = '10.0.11.0';
const DEFAULT_REDIS_PORT = 6379;
const DEFAULT_STREAM_MAXLEN = 10_800;

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
  page?: 'solo' | 'room';
}

export async function appendTrackingStream(payload: TrackingStreamPayload) {
  const jsonData = JSON.stringify(payload);
  const key = `tracking:${payload.meetingId}:${payload.userId}:stream`;
  const id = await sendRedisCommand([
    'XADD',
    key,
    'MAXLEN',
    '~',
    String(Number(process.env.REDIS_STREAM_MAXLEN ?? DEFAULT_STREAM_MAXLEN) || DEFAULT_STREAM_MAXLEN),
    '*',
    'data',
    jsonData,
  ]);

  return { key, id };
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

function makeJobId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `job-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export async function createTrackingAnalysisJob(request: TrackingAnalysisJobRequest) {
  const jobId = makeJobId();
  const status: TrackingAnalysisJobStatus = {
    jobId,
    meetingId: request.meetingId,
    userId: request.userId,
    page: request.page,
    reason: request.reason,
    status: 'queued',
    requestedAt: request.requestedAt,
  };
  const trackingStreamKey = `tracking:${request.meetingId}:${request.userId}:stream`;
  const statusKey = `tracking:job:${jobId}:status`;
  const jobPayload = JSON.stringify({
    ...status,
    trackingStreamKey,
  });

  await sendRedisCommand([
    'SET',
    statusKey,
    JSON.stringify(status),
    'EX',
    String(60 * 60 * 24),
  ]);

  await sendRedisCommand([
    'XADD',
    process.env.REDIS_ANALYSIS_JOBS_STREAM || 'tracking:analysis:jobs',
    'MAXLEN',
    '~',
    String(Number(process.env.REDIS_ANALYSIS_JOBS_MAXLEN ?? DEFAULT_STREAM_MAXLEN) || DEFAULT_STREAM_MAXLEN),
    '*',
    'data',
    jobPayload,
  ]);

  return {
    jobId,
    statusKey,
    trackingStreamKey,
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
