const DEFAULT_MIN_BPM = 45;
const DEFAULT_MAX_BPM = 180;
const EPSILON = 1e-12;
const RELIABLE_LOW_BPM = 58;

interface TimestampedSample {
  value: number;
  quality?: number;
  timeMs?: number;
  timestampMs?: number;
  time?: number;
}

interface NormalizedSamples {
  values: number[];
  timesSeconds: number[];
  durationSeconds: number;
}

interface SpectralBin {
  frequencyHz: number;
  power: number;
}

function isSampleObject(value: unknown): value is TimestampedSample {
  return !!value && typeof value === 'object' && 'value' in value;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function median(values: number[]) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const midpoint = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[midpoint - 1] + sorted[midpoint]) / 2
    : sorted[midpoint];
}

function normalizeSamples(samples: ArrayLike<number> | TimestampedSample[], fps: number): NormalizedSamples {
  if (!samples || typeof samples.length !== 'number') {
    throw new TypeError('samples must be an array or typed array.');
  }

  const count = samples.length;
  if (count === 0) return { values: [], timesSeconds: [], durationSeconds: 0 };

  const values: number[] = [];
  const timesSeconds: number[] = [];
  const first = (samples as ArrayLike<number | TimestampedSample>)[0];
  let firstTimeMs: number | null = null;

  if (isSampleObject(first)) {
    const timestamped = samples as TimestampedSample[];
    for (let i = 0; i < count; i += 1) {
      const sample = timestamped[i];
      const value = Number(sample.value);
      const fallbackTimeMs = i * (1000 / fps);
      const rawTimeMs = Number(sample.timeMs ?? sample.timestampMs ?? sample.time ?? fallbackTimeMs);

      if (!Number.isFinite(value) || !Number.isFinite(rawTimeMs)) continue;
      firstTimeMs ??= rawTimeMs;

      const relativeSeconds = (rawTimeMs - firstTimeMs) / 1000;
      if (timesSeconds.length > 0 && relativeSeconds <= timesSeconds[timesSeconds.length - 1]) continue;

      values.push(value);
      timesSeconds.push(relativeSeconds);
    }
  } else {
    const sampleRate = Number(fps);
    if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
      throw new Error('fps must be a positive number when samples are raw values.');
    }

    for (let i = 0; i < count; i += 1) {
      const value = Number((samples as ArrayLike<number>)[i]);
      if (!Number.isFinite(value)) continue;
      values.push(value);
      timesSeconds.push(i / sampleRate);
    }
  }

  const durationSeconds = values.length > 1
    ? Math.max(0, timesSeconds[timesSeconds.length - 1] - timesSeconds[0])
    : 0;

  return { values, timesSeconds, durationSeconds };
}

function meanAndStd(values: number[]) {
  let sum = 0;
  let valid = 0;
  for (const value of values) {
    if (!Number.isFinite(value)) continue;
    sum += value;
    valid += 1;
  }
  const mean = valid > 0 ? sum / valid : 0;

  let variance = 0;
  for (const value of values) {
    if (!Number.isFinite(value)) continue;
    const centered = value - mean;
    variance += centered * centered;
  }

  return { mean, std: valid > 0 ? Math.sqrt(variance / valid) : 0, valid };
}

function hann(index: number, count: number) {
  if (count <= 1) return 1;
  return 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / (count - 1));
}

function robustPreprocess(values: number[], timesSeconds: number[]) {
  const center = median(values);
  const deviations = values.map((value) => Math.abs(value - center));
  const mad = median(deviations);
  const { std: rawStd } = meanAndStd(values);
  const robustStd = Math.max(mad * 1.4826, rawStd * 0.25, EPSILON);
  const clipped = values.map((value) => clamp(value, center - robustStd * 4, center + robustStd * 4));

  const { mean: timeMean } = meanAndStd(timesSeconds);
  const { mean: valueMean } = meanAndStd(clipped);
  let numerator = 0;
  let denominator = 0;

  for (let i = 0; i < clipped.length; i += 1) {
    const centeredTime = timesSeconds[i] - timeMean;
    numerator += centeredTime * (clipped[i] - valueMean);
    denominator += centeredTime * centeredTime;
  }

  const slope = denominator > EPSILON ? numerator / denominator : 0;
  const detrended = clipped.map((value, index) => value - (valueMean + slope * (timesSeconds[index] - timeMean)));
  const { mean, std, valid } = meanAndStd(detrended);
  if (valid !== detrended.length || std < 1e-8) return null;

  return detrended.map((value) => (value - mean) / std);
}

function refinePeak(spectrum: SpectralBin[], index: number, stepHz: number) {
  if (index <= 0 || index >= spectrum.length - 1) return spectrum[index];

  const left = spectrum[index - 1].power;
  const center = spectrum[index].power;
  const right = spectrum[index + 1].power;
  const denominator = left - 2 * center + right;
  if (Math.abs(denominator) < EPSILON) return spectrum[index];

  const delta = clamp(0.5 * (left - right) / denominator, -1, 1);
  return {
    frequencyHz: spectrum[index].frequencyHz + delta * stepHz,
    power: Math.max(center - 0.25 * (left - right) * delta, center),
  };
}

function strongestBinNear(spectrum: SpectralBin[], targetFrequencyHz: number, radiusHz: number) {
  let bestIndex = -1;
  let bestPower = -Infinity;

  for (let index = 0; index < spectrum.length; index += 1) {
    const bin = spectrum[index];
    if (Math.abs(bin.frequencyHz - targetFrequencyHz) > radiusHz) continue;
    if (bin.power > bestPower) {
      bestPower = bin.power;
      bestIndex = index;
    }
  }

  return bestIndex;
}

function correctLikelyHarmonic(spectrum: SpectralBin[], peak: SpectralBin, stepHz: number, minHz: number) {
  const peakBpm = peak.frequencyHz * 60;
  if (peakBpm < 105) return peak;

  const targetFrequencyHz = peak.frequencyHz / 2;
  if (targetFrequencyHz < minHz) return peak;

  const fundamentalIndex = strongestBinNear(spectrum, targetFrequencyHz, Math.max(0.08, stepHz * 4));
  if (fundamentalIndex < 0) return peak;

  const fundamental = refinePeak(spectrum, fundamentalIndex, stepHz);
  const relativePower = fundamental.power / Math.max(peak.power, EPSILON);
  const threshold = peakBpm >= 135 ? 0.22 : 0.34;

  return relativePower >= threshold ? fundamental : peak;
}

function correctLikelyHighAlias(spectrum: SpectralBin[], peak: SpectralBin, stepHz: number, minHz: number) {
  const peakBpm = peak.frequencyHz * 60;
  if (peakBpm < 102) return peak;

  const ratios = [0.5, 0.6, 2 / 3, 0.75];
  const noiseFloor = median(spectrum.map((bin) => bin.power));
  let best = peak;
  let bestScore = peak.power * peakSelectionPrior(peakBpm);

  for (const ratio of ratios) {
    const targetFrequencyHz = peak.frequencyHz * ratio;
    if (targetFrequencyHz < minHz) continue;

    const index = strongestBinNear(spectrum, targetFrequencyHz, Math.max(0.1, stepHz * 5));
    if (index < 0) continue;

    const candidate = refinePeak(spectrum, index, stepHz);
    const candidateBpm = candidate.frequencyHz * 60;
    if (candidateBpm < RELIABLE_LOW_BPM || candidateBpm > 105) continue;

    const relativePower = candidate.power / Math.max(peak.power, EPSILON);
    const signalOverNoise = candidate.power / Math.max(noiseFloor, EPSILON);
    const enoughPower = peakBpm >= 112
      ? relativePower >= 0.14 && signalOverNoise >= 1.7
      : relativePower >= 0.22 && signalOverNoise >= 2.2;
    if (!enoughPower) continue;

    const score = candidate.power * peakSelectionPrior(candidateBpm);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  return best;
}

function peakSelectionPrior(bpm: number, preferredBpm?: number) {
  const lowPrior = bpm >= 62
    ? 1
    : bpm <= 52
      ? 0.12
      : 0.12 + ((bpm - 52) / 10) * 0.88;
  const restingPrior = bpm <= 105
    ? lowPrior
    : bpm >= 135
      ? 0.18
      : 1 - ((bpm - 105) / 30) * 0.82;

  if (!Number.isFinite(preferredBpm) || Number(preferredBpm) <= 0) {
    const initialHighPenalty = bpm <= 100
      ? 1
      : bpm >= 122
        ? 0.26
        : 1 - ((bpm - 100) / 22) * 0.74;
    return restingPrior * initialHighPenalty;
  }

  const baseline = Number(preferredBpm);
  const diff = Math.abs(bpm - baseline);
  const continuityPrior = Math.max(0.22, Math.exp(-diff / 42));
  const upwardJump = bpm - baseline;
  const upwardPrior = upwardJump <= 14
    ? 1
    : upwardJump >= 42
      ? 0.25
      : 1 - ((upwardJump - 14) / 28) * 0.75;
  const downwardJump = baseline - bpm;
  const downwardPrior = downwardJump <= 12
    ? 1
    : downwardJump >= 28
      ? 0.28
      : 1 - ((downwardJump - 12) / 16) * 0.72;

  return restingPrior * continuityPrior * upwardPrior * downwardPrior;
}

function choosePeakIndex(spectrum: SpectralBin[], preferredBpm?: number) {
  let selectedIndex = 0;
  let selectedScore = -Infinity;

  for (let index = 0; index < spectrum.length; index += 1) {
    const current = spectrum[index];
    const previousPower = index > 0 ? spectrum[index - 1].power : -Infinity;
    const nextPower = index < spectrum.length - 1 ? spectrum[index + 1].power : -Infinity;
    const isLocalPeak = current.power >= previousPower && current.power >= nextPower;
    if (!isLocalPeak) continue;

    const bpm = current.frequencyHz * 60;
    const score = current.power * peakSelectionPrior(bpm, preferredBpm);
    if (score > selectedScore) {
      selectedScore = score;
      selectedIndex = index;
    }
  }

  return selectedIndex;
}

function peakStats(spectrum: SpectralBin[], peakFrequencyHz: number, peakPower: number) {
  const excludedHz = 0.12;
  const noisePowers: number[] = [];
  let secondBestPower = 0;
  let totalPower = 0;

  for (const bin of spectrum) {
    totalPower += bin.power;
    if (Math.abs(bin.frequencyHz - peakFrequencyHz) <= excludedHz) continue;

    noisePowers.push(bin.power);
    secondBestPower = Math.max(secondBestPower, bin.power);
  }

  const averagePower = spectrum.length > 0 ? totalPower / spectrum.length : 0;
  const medianNoisePower = median(noisePowers);
  const peakToAverage = peakPower / Math.max(averagePower, EPSILON);
  const peakToMedian = peakPower / Math.max(medianNoisePower, EPSILON);
  const prominence = peakPower / Math.max(secondBestPower, EPSILON);

  return { peakToAverage, peakToMedian, prominence };
}

function confidenceFromSpectrum({
  durationSeconds,
  minDurationSeconds,
  peakToMedian,
  prominence,
}: {
  durationSeconds: number;
  minDurationSeconds: number;
  peakToMedian: number;
  prominence: number;
}) {
  const signalScore = clamp((Math.log2(Math.max(peakToMedian, 1)) - 1) / 3, 0, 1);
  const prominenceScore = clamp((prominence - 1.05) / 1.5, 0, 1);
  const durationScore = clamp((durationSeconds - minDurationSeconds) / 6, 0, 1);
  return clamp(signalScore * 0.55 + prominenceScore * 0.35 + durationScore * 0.1, 0, 1);
}

export interface BpmEstimate {
  bpm: number;
  frequencyHz: number;
  confidence: number;
  phase: 'preview' | 'stable';
  peakToAverage: number;
  peakToMedian: number;
  prominence: number;
  power: number;
  sampleCount: number;
  durationSeconds: number;
  rawBpm?: number;
}

export function estimateBpm(samples: ArrayLike<number> | TimestampedSample[], {
  fps = 30,
  minBpm = DEFAULT_MIN_BPM,
  maxBpm = DEFAULT_MAX_BPM,
  minSamples = 90,
  minDurationSeconds = 6,
  frequencyStepHz,
  preferredBpm,
}: {
  fps?: number;
  minBpm?: number;
  maxBpm?: number;
  minSamples?: number;
  minDurationSeconds?: number;
  frequencyStepHz?: number;
  preferredBpm?: number | null;
} = {}): BpmEstimate | null {
  const { values, timesSeconds, durationSeconds } = normalizeSamples(samples, fps);
  const sampleCount = values.length;

  if (sampleCount < minSamples || durationSeconds < minDurationSeconds) return null;
  if (minBpm <= 0 || maxBpm <= minBpm) throw new Error('Expected maxBpm to be greater than minBpm.');

  const processed = robustPreprocess(values, timesSeconds);
  if (!processed) return null;

  const minHz = minBpm / 60;
  const maxHz = maxBpm / 60;
  const stepHz = Number.isFinite(frequencyStepHz) && Number(frequencyStepHz) > 0
    ? Number(frequencyStepHz)
    : Math.max(0.003, 1 / Math.max(durationSeconds * 8, 1));

  const spectrum: SpectralBin[] = [];
  let bestPower = -Infinity;
  let bestIndex = 0;

  for (let frequencyHz = minHz; frequencyHz <= maxHz + EPSILON; frequencyHz += stepHz) {
    const angular = 2 * Math.PI * frequencyHz;
    let real = 0;
    let imag = 0;

    for (let i = 0; i < sampleCount; i += 1) {
      const windowed = processed[i] * hann(i, sampleCount);
      const phase = angular * timesSeconds[i];
      real += windowed * Math.cos(phase);
      imag -= windowed * Math.sin(phase);
    }

    const power = real * real + imag * imag;
    const index = spectrum.push({ frequencyHz, power }) - 1;

    if (power > bestPower) {
      bestPower = power;
      bestIndex = index;
    }
  }

  if (spectrum.length === 0 || bestPower <= 0) return null;

  const selectedIndex = choosePeakIndex(spectrum, preferredBpm ?? undefined);
  const rawPeak = refinePeak(spectrum, selectedIndex >= 0 ? selectedIndex : bestIndex, stepHz);
  const harmonicCorrected = correctLikelyHarmonic(spectrum, rawPeak, stepHz, minHz);
  const refined = correctLikelyHighAlias(spectrum, harmonicCorrected, stepHz, minHz);
  const { peakToAverage, peakToMedian, prominence } = peakStats(spectrum, refined.frequencyHz, refined.power);
  const confidence = confidenceFromSpectrum({
    durationSeconds,
    minDurationSeconds,
    peakToMedian,
    prominence,
  });

  return {
    bpm: clamp(refined.frequencyHz * 60, minBpm, maxBpm),
    frequencyHz: refined.frequencyHz,
    confidence,
    phase: 'stable',
    peakToAverage,
    peakToMedian,
    prominence,
    power: refined.power,
    sampleCount,
    durationSeconds,
  };
}

export class RollingBpmEstimator {
  windowSeconds: number;
  fps: number;
  minBpm: number;
  maxBpm: number;
  minSamples: number;
  minDurationSeconds: number;
  previewMinSamples: number;
  previewMinDurationSeconds: number;
  previewMaxBpm: number;
  previewMinConfidence: number;
  smoothing: number;
  minConfidence: number;
  minSampleQuality: number;
  maxBpmDelta: number;
  samples: Required<Pick<TimestampedSample, 'value' | 'timeMs'>>[] = [];
  smoothedBpm: number | null = null;
  lastOutputTimeMs: number | null = null;

  constructor({
    windowSeconds = 12,
    fps = 30,
    minBpm = DEFAULT_MIN_BPM,
    maxBpm = DEFAULT_MAX_BPM,
    minSamples = 90,
    minDurationSeconds = 6,
    previewMinSamples = 30,
    previewMinDurationSeconds = 1.8,
    previewMaxBpm = 135,
    previewMinConfidence = 0,
    smoothing = 0.75,
    minConfidence = 0.18,
    minSampleQuality = 0.45,
    maxBpmDelta = 8,
  } = {}) {
    this.windowSeconds = Number(windowSeconds);
    this.fps = Number(fps);
    this.minBpm = Number(minBpm);
    this.maxBpm = Number(maxBpm);
    this.minSamples = Number(minSamples);
    this.minDurationSeconds = Number(minDurationSeconds);
    this.previewMinSamples = Number(previewMinSamples);
    this.previewMinDurationSeconds = Number(previewMinDurationSeconds);
    this.previewMaxBpm = Number(previewMaxBpm);
    this.previewMinConfidence = Number(previewMinConfidence);
    this.smoothing = Number(smoothing);
    this.minConfidence = Number(minConfidence);
    this.minSampleQuality = Number(minSampleQuality);
    this.maxBpmDelta = Number(maxBpmDelta);
  }

  reset() {
    this.samples = [];
    this.smoothedBpm = null;
    this.lastOutputTimeMs = null;
  }

  add(value: number, timeMs = Date.now(), quality = 1): BpmEstimate | null {
    const normalizedQuality = clamp(Number.isFinite(Number(quality)) ? Number(quality) : 1, 0, 1);
    if (normalizedQuality >= clamp(this.minSampleQuality, 0, 1)) {
      const sample = { value: Number(value), timeMs: Number(timeMs) };
      this.samples.push(sample);
    }
    this.prune(timeMs);
    return this.estimate();
  }

  prune(referenceTimeMs = Date.now()) {
    const cutoffMs = Number(referenceTimeMs) - this.windowSeconds * 1000;
    while (this.samples.length > 0 && this.samples[0].timeMs < cutoffMs) {
      this.samples.shift();
    }
  }

  estimate(): BpmEstimate | null {
    const stableResult = estimateBpm(this.samples, {
      fps: this.fps,
      minBpm: this.minBpm,
      maxBpm: this.maxBpm,
      minSamples: this.minSamples,
      minDurationSeconds: this.minDurationSeconds,
      preferredBpm: this.smoothedBpm,
    });

    const previewResult = stableResult ?? estimateBpm(this.samples, {
      fps: this.fps,
      minBpm: this.minBpm,
      maxBpm: Math.min(this.maxBpm, this.previewMaxBpm),
      minSamples: Math.min(this.minSamples, this.previewMinSamples),
      minDurationSeconds: Math.min(this.minDurationSeconds, this.previewMinDurationSeconds),
      frequencyStepHz: 0.01,
      preferredBpm: this.smoothedBpm,
    });

    const result = previewResult
      ? { ...previewResult, phase: stableResult ? 'stable' as const : 'preview' as const }
      : null;

    if (!result) return null;

    const isPreview = result.phase === 'preview';
    const minConfidence = clamp(isPreview ? this.previewMinConfidence : this.minConfidence, 0, 1);
    if (this.smoothedBpm == null && result.confidence < minConfidence) return null;
    if (this.smoothedBpm == null && result.bpm > 125 && result.confidence < 0.35) return null;
    if (this.smoothedBpm == null && result.bpm < RELIABLE_LOW_BPM && result.confidence < 0.55) return null;

    let candidateBpm = result.bpm;
    if (this.smoothedBpm != null) {
      if (result.confidence < minConfidence) {
        candidateBpm = this.smoothedBpm;
      } else {
        const suspiciousLowDrop = this.smoothedBpm >= 68 && result.bpm < RELIABLE_LOW_BPM && result.confidence < 0.7;
        if (suspiciousLowDrop) {
          candidateBpm = this.smoothedBpm;
        } else {
        const latestSample = this.samples[this.samples.length - 1];
        const currentTimeMs = latestSample?.timeMs ?? Date.now();
        const elapsedSeconds = this.lastOutputTimeMs == null
          ? 1 / Math.max(this.fps, 1)
          : clamp((currentTimeMs - this.lastOutputTimeMs) / 1000, 1 / 120, 1);
        const upwardLimit = Math.max(0.12, (isPreview ? 3 : 5) * elapsedSeconds);
        const downwardLimit = Math.max(0.12, (isPreview ? 3 : 4) * elapsedSeconds);
        candidateBpm = this.smoothedBpm + clamp(result.bpm - this.smoothedBpm, -downwardLimit, upwardLimit);
        }
      }
    }

    const baseSmoothing = isPreview ? Math.min(this.smoothing, 0.55) : this.smoothing;
    const alpha = clamp(baseSmoothing + (0.5 - result.confidence) * 0.25, isPreview ? 0.35 : 0.45, isPreview ? 0.68 : 0.9);
    this.smoothedBpm = this.smoothedBpm == null
      ? candidateBpm
      : alpha * this.smoothedBpm + (1 - alpha) * candidateBpm;
    this.lastOutputTimeMs = this.samples[this.samples.length - 1]?.timeMs ?? Date.now();

    return { ...result, rawBpm: result.bpm, bpm: this.smoothedBpm };
  }
}
