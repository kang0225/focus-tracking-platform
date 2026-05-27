const DEFAULT_MIN_BPM = 45;
const DEFAULT_MAX_BPM = 180;
const EPSILON = 1e-12;
const RELIABLE_LOW_BPM = 58;
const INITIAL_FOCUS_AVERAGE_RAW_SCORE = 17.183;
const FOCUS_THRESHOLD_RATIO = 0.33;
const MIN_FOCUS_NORMALIZATION_SPAN = 1;

export interface TimestampedSample {
  value: number;
  quality?: number;
  timeMs?: number;
  timestampMs?: number;
  time?: number;
}

interface NormalizedSamples {
  values: number[];
  timesSeconds: number[];
  qualities: number[];
  durationSeconds: number;
  averageQuality: number;
}

interface SpectralBin {
  frequencyHz: number;
  power: number;
}

interface PulsePeak {
  timeSeconds: number;
  value: number;
}

interface PpiSeries {
  timesSeconds: number[];
  intervalsMs: number[];
}

export interface RppgFocusThresholdState {
  lowAverageRawScore: number;
  highAverageRawScore: number;
  lowSampleCount: number;
  highSampleCount: number;
}

function isSampleObject(value: unknown): value is TimestampedSample {
  return !!value && typeof value === 'object' && 'value' in value;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function createInitialRppgFocusThresholdState(): RppgFocusThresholdState {
  return {
    lowAverageRawScore: INITIAL_FOCUS_AVERAGE_RAW_SCORE,
    highAverageRawScore: INITIAL_FOCUS_AVERAGE_RAW_SCORE,
    lowSampleCount: 1,
    highSampleCount: 1,
  };
}

function focusThresholdRawScore(state: RppgFocusThresholdState) {
  return state.lowAverageRawScore
    + FOCUS_THRESHOLD_RATIO * (state.highAverageRawScore - state.lowAverageRawScore);
}

function updateRunningAverage(average: number, count: number, value: number) {
  const nextCount = count + 1;
  return {
    average: average + ((value - average) / nextCount),
    count: nextCount,
  };
}

export function classifyAndUpdateFocusThreshold(rawScore: number, state: RppgFocusThresholdState) {
  const thresholdRawScore = focusThresholdRawScore(state);
  const spanRawScore = Math.abs(state.highAverageRawScore - state.lowAverageRawScore);
  const isFocused = rawScore >= thresholdRawScore;

  if (isFocused) {
    const next = updateRunningAverage(state.highAverageRawScore, state.highSampleCount, rawScore);
    state.highAverageRawScore = next.average;
    state.highSampleCount = next.count;
  } else {
    const next = updateRunningAverage(state.lowAverageRawScore, state.lowSampleCount, rawScore);
    state.lowAverageRawScore = next.average;
    state.lowSampleCount = next.count;
  }

  return { thresholdRawScore, spanRawScore, isFocused };
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
  if (count === 0) return { values: [], timesSeconds: [], qualities: [], durationSeconds: 0, averageQuality: 0 };

  const values: number[] = [];
  const timesSeconds: number[] = [];
  const qualities: number[] = [];
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
      qualities.push(clamp(Number(sample.quality ?? 1), 0, 1));
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
      qualities.push(1);
    }
  }

  const durationSeconds = values.length > 1
    ? Math.max(0, timesSeconds[timesSeconds.length - 1] - timesSeconds[0])
    : 0;
  const averageQuality = qualities.length > 0
    ? qualities.reduce((sum, quality) => sum + quality, 0) / qualities.length
    : 0;

  return { values, timesSeconds, qualities, durationSeconds, averageQuality };
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
  const threshold = peakBpm >= 135 ? 0.45 : 0.55;

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
      ? relativePower >= 0.32 && signalOverNoise >= 2.4
      : relativePower >= 0.4 && signalOverNoise >= 2.8;
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
    : bpm >= 150
      ? 0.52
      : 1 - ((bpm - 105) / 45) * 0.48;

  if (!Number.isFinite(preferredBpm) || Number(preferredBpm) <= 0) {
    const initialHighPenalty = bpm <= 110
      ? 1
      : bpm >= 155
        ? 0.65
        : 1 - ((bpm - 110) / 45) * 0.35;
    return restingPrior * initialHighPenalty;
  }

  const baseline = Number(preferredBpm);
  const diff = Math.abs(bpm - baseline);
  const continuityPrior = Math.max(0.38, Math.exp(-diff / 48));
  const upwardJump = bpm - baseline;
  const upwardPrior = upwardJump <= 14
    ? 1
    : upwardJump >= 42
      ? 0.55
      : 1 - ((upwardJump - 14) / 28) * 0.45;
  const downwardJump = baseline - bpm;
  const downwardPrior = downwardJump <= 12
    ? 1
    : downwardJump >= 28
      ? 0.38
      : 1 - ((downwardJump - 12) / 16) * 0.62;

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

function movingAverage(values: number[], radius: number) {
  if (values.length === 0 || radius <= 0) return values;

  const smoothed = new Array<number>(values.length);
  let sum = 0;
  let left = 0;

  for (let right = 0; right < values.length; right += 1) {
    sum += values[right];

    while (right - left > radius * 2) {
      sum -= values[left];
      left += 1;
    }

    smoothed[right] = sum / (right - left + 1);
  }

  return smoothed;
}

function localPulsePeaks(values: number[], timesSeconds: number[], minPeakDistanceSeconds: number) {
  const { mean, std } = meanAndStd(values);
  const threshold = mean + std * 0.05;
  const candidates: PulsePeak[] = [];

  for (let index = 1; index < values.length - 1; index += 1) {
    const value = values[index];
    if (value < threshold) continue;
    if (value >= values[index - 1] && value > values[index + 1]) {
      candidates.push({ timeSeconds: timesSeconds[index], value });
    }
  }

  const peaks: PulsePeak[] = [];
  for (const candidate of candidates) {
    const last = peaks[peaks.length - 1];
    if (last && candidate.timeSeconds - last.timeSeconds < minPeakDistanceSeconds) {
      if (candidate.value > last.value) peaks[peaks.length - 1] = candidate;
      continue;
    }

    peaks.push(candidate);
  }

  return peaks;
}

function buildPpiSeries(peaks: PulsePeak[], minPpiMs: number, maxPpiMs: number): PpiSeries | null {
  const intervalsMs: number[] = [];
  const timesSeconds: number[] = [];

  for (let index = 1; index < peaks.length; index += 1) {
    const intervalMs = (peaks[index].timeSeconds - peaks[index - 1].timeSeconds) * 1000;
    if (intervalMs < minPpiMs || intervalMs > maxPpiMs) continue;

    intervalsMs.push(intervalMs);
    timesSeconds.push(peaks[index].timeSeconds);
  }

  if (intervalsMs.length < 2) return null;

  const center = median(intervalsMs);
  const filteredIntervals: number[] = [];
  const filteredTimes: number[] = [];

  for (let index = 0; index < intervalsMs.length; index += 1) {
    const interval = intervalsMs[index];
    if (interval < center * 0.65 || interval > center * 1.45) continue;
    filteredIntervals.push(interval);
    filteredTimes.push(timesSeconds[index]);
  }

  return filteredIntervals.length >= 2
    ? { intervalsMs: filteredIntervals, timesSeconds: filteredTimes }
    : null;
}

function ppiSeriesQuality(series: PpiSeries | null) {
  if (!series || series.intervalsMs.length < 2) return -Infinity;
  const { mean, std } = meanAndStd(series.intervalsMs);
  const coefficientOfVariation = std / Math.max(mean, EPSILON);
  return series.intervalsMs.length - coefficientOfVariation * 6;
}

function detectPpiSeries(
  processed: number[],
  timesSeconds: number[],
  sampleRate: number,
  minPpiMs: number,
  maxPpiMs: number,
) {
  const radius = Math.max(1, Math.round(sampleRate * 0.08));
  const minPeakDistanceSeconds = (minPpiMs / 1000) * 0.72;
  const candidates = [1, -1].map((polarity) => {
    const oriented = processed.map((value) => value * polarity);
    const smoothed = movingAverage(oriented, radius);
    const peaks = localPulsePeaks(smoothed, timesSeconds, minPeakDistanceSeconds);
    const series = buildPpiSeries(peaks, minPpiMs, maxPpiMs);
    return { series, quality: ppiSeriesQuality(series) };
  });

  return candidates[0].quality >= candidates[1].quality ? candidates[0].series : candidates[1].series;
}

function detrendSeries(values: number[], timesSeconds: number[]) {
  const { mean: timeMean } = meanAndStd(timesSeconds);
  const { mean: valueMean } = meanAndStd(values);
  let numerator = 0;
  let denominator = 0;

  for (let index = 0; index < values.length; index += 1) {
    const centeredTime = timesSeconds[index] - timeMean;
    numerator += centeredTime * (values[index] - valueMean);
    denominator += centeredTime * centeredTime;
  }

  const slope = denominator > EPSILON ? numerator / denominator : 0;
  return values.map((value, index) => value - (valueMean + slope * (timesSeconds[index] - timeMean)));
}

function interpolatePpi(series: PpiSeries, sampleRate: number) {
  const start = series.timesSeconds[0];
  const end = series.timesSeconds[series.timesSeconds.length - 1];
  const count = Math.floor((end - start) * sampleRate) + 1;
  if (count < 4) return null;

  const values: number[] = [];
  const timesSeconds: number[] = [];
  let cursor = 0;

  for (let index = 0; index < count; index += 1) {
    const time = start + index / sampleRate;
    while (cursor < series.timesSeconds.length - 2 && series.timesSeconds[cursor + 1] < time) {
      cursor += 1;
    }

    const leftTime = series.timesSeconds[cursor];
    const rightTime = series.timesSeconds[Math.min(cursor + 1, series.timesSeconds.length - 1)];
    const leftValue = series.intervalsMs[cursor];
    const rightValue = series.intervalsMs[Math.min(cursor + 1, series.intervalsMs.length - 1)];
    const ratio = rightTime > leftTime ? (time - leftTime) / (rightTime - leftTime) : 0;

    values.push(leftValue + (rightValue - leftValue) * clamp(ratio, 0, 1));
    timesSeconds.push(time - start);
  }

  return { values, timesSeconds };
}

function highFrequencyPpiPower(series: PpiSeries, sampleRate = 2) {
  const interpolated = interpolatePpi(series, sampleRate);
  if (!interpolated) return null;

  const values = detrendSeries(interpolated.values, interpolated.timesSeconds);
  const count = values.length;
  const frequencyStepHz = sampleRate / count;
  let windowPower = 0;
  let bandPower = 0;

  for (let index = 0; index < count; index += 1) {
    const weight = hann(index, count);
    windowPower += weight * weight;
  }

  for (let bin = 1; bin <= Math.floor(count / 2); bin += 1) {
    const frequencyHz = bin * frequencyStepHz;
    if (frequencyHz < 0.15 || frequencyHz > 0.4) continue;

    let real = 0;
    let imag = 0;
    for (let index = 0; index < count; index += 1) {
      const weight = hann(index, count);
      const phase = 2 * Math.PI * frequencyHz * interpolated.timesSeconds[index];
      real += values[index] * weight * Math.cos(phase);
      imag -= values[index] * weight * Math.sin(phase);
    }

    const powerDensity = (2 / Math.max(sampleRate * windowPower, EPSILON)) * (real * real + imag * imag);
    bandPower += powerDensity * frequencyStepHz;
  }

  return Math.max(bandPower, EPSILON);
}

function estimatePpiBpm(
  processed: number[],
  timesSeconds: number[],
  minBpm: number,
  maxBpm: number,
) {
  const durationSeconds = timesSeconds.length > 1
    ? timesSeconds[timesSeconds.length - 1] - timesSeconds[0]
    : 0;
  const sampleRate = processed.length > 1 && durationSeconds > 0
    ? (processed.length - 1) / durationSeconds
    : 0;
  if (sampleRate <= 0) return null;

  const ppiSeries = detectPpiSeries(
    processed,
    timesSeconds,
    sampleRate,
    60000 / maxBpm,
    60000 / minBpm,
  );
  if (!ppiSeries || ppiSeries.intervalsMs.length < 3) return null;

  const ppiMs = median(ppiSeries.intervalsMs);
  const bpm = 60000 / Math.max(ppiMs, EPSILON);
  if (!Number.isFinite(bpm) || bpm < minBpm || bpm > maxBpm) return null;

  const { mean, std } = meanAndStd(ppiSeries.intervalsMs);
  const coefficientOfVariation = std / Math.max(mean, EPSILON);
  const regularity = clamp(1 - coefficientOfVariation / 0.22, 0, 1);
  const intervalScore = clamp((ppiSeries.intervalsMs.length - 2) / 8, 0, 1);
  const confidence = clamp(regularity * 0.7 + intervalScore * 0.3, 0, 1);

  return {
    bpm,
    confidence,
    intervalCount: ppiSeries.intervalsMs.length,
    coefficientOfVariation,
  };
}

function correctPeakWithPpi(
  spectrum: SpectralBin[],
  peak: SpectralBin,
  ppiBpm: ReturnType<typeof estimatePpiBpm>,
  stepHz: number,
) {
  if (!ppiBpm || ppiBpm.confidence < 0.45) return peak;

  const peakBpm = peak.frequencyHz * 60;
  const harmonicLike = peakBpm >= 108
    && ppiBpm.bpm >= RELIABLE_LOW_BPM
    && ppiBpm.bpm <= 108
    && Math.abs(peakBpm - ppiBpm.bpm * 2) <= Math.max(12, ppiBpm.bpm * 0.18);
  if (!harmonicLike) return peak;

  const index = strongestBinNear(spectrum, ppiBpm.bpm / 60, Math.max(0.1, stepHz * 5));
  if (index < 0) return peak;

  const candidate = refinePeak(spectrum, index, stepHz);
  const relativePower = candidate.power / Math.max(peak.power, EPSILON);
  const requiredPower = harmonicLike ? 0.22 : 0.42;

  return relativePower >= requiredPower ? candidate : peak;
}

function correctLikelyLowLock(spectrum: SpectralBin[], peak: SpectralBin, stepHz: number) {
  const peakBpm = peak.frequencyHz * 60;
  if (peakBpm >= 68) return peak;

  const noiseFloor = median(spectrum.map((bin) => bin.power));
  let best: (SpectralBin & { relativePower: number }) | null = null;
  let bestScore = -Infinity;

  for (let index = 1; index < spectrum.length - 1; index += 1) {
    const current = spectrum[index];
    const bpm = current.frequencyHz * 60;
    if (bpm < 72 || bpm > 105) continue;
    if (current.power < spectrum[index - 1].power || current.power < spectrum[index + 1].power) continue;

    const candidate = refinePeak(spectrum, index, stepHz);
    const relativePower = candidate.power / Math.max(peak.power, EPSILON);
    const signalOverNoise = candidate.power / Math.max(noiseFloor, EPSILON);
    if (relativePower < 0.42 || signalOverNoise < 2.1) continue;

    const bpmScore = bpm <= 92 ? 1.15 : 1;
    const score = relativePower * signalOverNoise * bpmScore;
    if (score > bestScore) {
      best = { ...candidate, relativePower };
      bestScore = score;
    }
  }

  if (!best) return peak;

  const requiredPower = peakBpm < 58 ? 0.62 : 0.48;
  return best.relativePower >= requiredPower ? best : peak;
}

function normalizeFocusScore(rawScore: number, thresholdRawScore: number, spanRawScore: number) {
  const normalized = 50
    + ((rawScore - thresholdRawScore) / Math.max(spanRawScore, MIN_FOCUS_NORMALIZATION_SPAN, EPSILON)) * 50;
  return Math.round(clamp(normalized, 0, 100));
}

function confidenceFromSpectrum({
  durationSeconds,
  minDurationSeconds,
  peakToMedian,
  prominence,
  averageQuality,
}: {
  durationSeconds: number;
  minDurationSeconds: number;
  peakToMedian: number;
  prominence: number;
  averageQuality: number;
}) {
  const signalScore = clamp((Math.log2(Math.max(peakToMedian, 1)) - 1) / 3, 0, 1);
  const prominenceScore = clamp((prominence - 1.05) / 1.5, 0, 1);
  const durationScore = clamp((durationSeconds - minDurationSeconds) / 6, 0, 1);
  const qualityScore = clamp((averageQuality - 0.35) / 0.65, 0, 1);
  return clamp((signalScore * 0.5 + prominenceScore * 0.32 + durationScore * 0.08) * (0.75 + qualityScore * 0.25), 0, 1);
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

export interface RppgFocusEstimate {
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
  const { values, timesSeconds, qualities, durationSeconds, averageQuality } = normalizeSamples(samples, fps);
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
      const qualityWeight = Math.sqrt(clamp(qualities[i] ?? 1, 0, 1));
      const windowed = processed[i] * hann(i, sampleCount) * qualityWeight;
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
  const aliasCorrected = correctLikelyHighAlias(spectrum, harmonicCorrected, stepHz, minHz);
  const ppiBpm = estimatePpiBpm(processed, timesSeconds, minBpm, maxBpm);
  const ppiCorrected = correctPeakWithPpi(spectrum, aliasCorrected, ppiBpm, stepHz);
  const refined = correctLikelyLowLock(spectrum, ppiCorrected, stepHz);
  const { peakToAverage, peakToMedian, prominence } = peakStats(spectrum, refined.frequencyHz, refined.power);
  const confidence = confidenceFromSpectrum({
    durationSeconds,
    minDurationSeconds,
    peakToMedian,
    prominence,
    averageQuality,
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

export function estimateRppgFocus(samples: TimestampedSample[], {
  fps = 30,
  minBpm = DEFAULT_MIN_BPM,
  maxBpm = DEFAULT_MAX_BPM,
  minSamples = 120,
  minDurationSeconds = 15,
  minIntervals = 8,
  focusThresholdState = createInitialRppgFocusThresholdState(),
}: {
  fps?: number;
  minBpm?: number;
  maxBpm?: number;
  minSamples?: number;
  minDurationSeconds?: number;
  minIntervals?: number;
  focusThresholdState?: RppgFocusThresholdState;
} = {}): RppgFocusEstimate | null {
  const { values, timesSeconds, durationSeconds } = normalizeSamples(samples, fps);
  const sampleCount = values.length;

  if (sampleCount < minSamples || durationSeconds < minDurationSeconds) return null;
  if (minBpm <= 0 || maxBpm <= minBpm) throw new Error('Expected maxBpm to be greater than minBpm.');

  const processed = robustPreprocess(values, timesSeconds);
  if (!processed) return null;

  const sampleRate = sampleCount > 1 && durationSeconds > 0 ? (sampleCount - 1) / durationSeconds : fps;
  const ppiSeries = detectPpiSeries(
    processed,
    timesSeconds,
    sampleRate,
    60000 / maxBpm,
    60000 / minBpm,
  );

  if (!ppiSeries || ppiSeries.intervalsMs.length < minIntervals) return null;

  const { mean: ppiMs } = meanAndStd(ppiSeries.intervalsMs);
  const successiveDifferences = ppiSeries.intervalsMs
    .slice(1)
    .map((interval, index) => interval - ppiSeries.intervalsMs[index]);
  if (successiveDifferences.length === 0) return null;

  const rmssdPpiMs = Math.sqrt(
    successiveDifferences.reduce((sum, difference) => sum + difference * difference, 0)
    / successiveDifferences.length,
  );
  const hfPpiPower = highFrequencyPpiPower(ppiSeries);

  if (!Number.isFinite(ppiMs) || !Number.isFinite(rmssdPpiMs) || !hfPpiPower || rmssdPpiMs <= 0) {
    return null;
  }

  const rawScore = Math.log(ppiMs / 100) + Math.log(rmssdPpiMs) + Math.log(hfPpiPower);
  const focusDecision = classifyAndUpdateFocusThreshold(rawScore, focusThresholdState);

  return {
    score: normalizeFocusScore(rawScore, focusDecision.thresholdRawScore, focusDecision.spanRawScore),
    rawScore: Number(rawScore.toFixed(3)),
    thresholdRawScore: Number(focusDecision.thresholdRawScore.toFixed(3)),
    isFocused: focusDecision.isFocused,
    ppiMs: Number(ppiMs.toFixed(1)),
    rmssdPpiMs: Number(rmssdPpiMs.toFixed(1)),
    hfPpiPower: Number(hfPpiPower.toFixed(3)),
    peakIntervalCount: ppiSeries.intervalsMs.length,
    sampleCount,
    durationSeconds: Number(durationSeconds.toFixed(2)),
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
  samples: Required<Pick<TimestampedSample, 'value' | 'timeMs' | 'quality'>>[] = [];
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
      const sample = { value: Number(value), timeMs: Number(timeMs), quality: normalizedQuality };
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
