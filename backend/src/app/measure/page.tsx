'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import WebcamView from '@/components/WebcamView';
import { GazeCalibrationOverlay } from '@/components/GazeCalibrationOverlay';
import GazeDot from '@/components/GazeDot';
import { HeartRateSourceSelector } from '@/components/HeartRateSourceSelector';
import { StatusCard } from '@/components/StatusCard';
import { MinuteHeartRateAverageBox } from '@/components/MinuteHeartRateAverageBox';
import { useConcentrationData } from '@/hooks/useConcentrationData';
import { useTrackingAnalysisJob } from '@/hooks/useTrackingAnalysisJob';
import { useMinuteHeartRateAverages } from '@/hooks/useMinuteHeartRateAverages';
import { useTrackingStreamPublisher } from '@/hooks/useTrackingStreamPublisher';
import type { HeartRateSourcePreference } from '@/types/tracker';

function makeTrackingId(prefix: string) {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function formatMetric(value: number | null | undefined, digits = 3) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '--';
  return Number.isInteger(value) ? String(value) : value.toFixed(digits);
}

export default function MeasurePage() {
  const router = useRouter();
  const createTrackingAnalysisJob = useTrackingAnalysisJob();
  const [isFinishing, setIsFinishing] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [heartRateSourcePreference, setHeartRateSourcePreference] = useState<HeartRateSourcePreference>('webcam');
  const soloMeetingId = useMemo(() => makeTrackingId('solo'), []);
  const soloUserId = useMemo(() => makeTrackingId('user'), []);

  const {
    coordinates,
    rawCoordinates,
    isLoaded,
    isCalibrated,
    currentCalibrationPointIndex,
    calibrationPointClickCount,
    clicksPerCalibrationPoint,
    totalCalibrationPoints,
    isCalibrationBusy,
    recordCalibrationPoint,
    resetCalibration,
    heartRate,
    heartRateSource,
    heartRateStatus,
    isHeartRateMeasuring,
    focusRawScore,
    focusIsFocused,
    focusThresholdRawScore,
    focusSource,
    hasAppleWatchConnection,
    isTrackingReady,
  } = useConcentrationData({ paused: isPaused, heartRateSourcePreference });

  const minuteHeartRateAverages = useMinuteHeartRateAverages(heartRate, !isPaused && (heartRate > 0 || isHeartRateMeasuring));
  const focusDisplayScore = formatMetric(focusRawScore);
  const focusThresholdDisplay = formatMetric(focusThresholdRawScore);
  const focusStatus = isPaused ? '일시정지' : focusIsFocused == null ? '판정 대기' : focusIsFocused ? '집중 중' : '집중 저하';

  const { stopPublishing } = useTrackingStreamPublisher({
    enabled: isLoaded && isTrackingReady,
    paused: isPaused,
    data: {
      meetingId: soloMeetingId,
      userId: soloUserId,
      heartRate,
      heartRateSource,
      heartRateStatus,
      gazeX: coordinates.x,
      gazeY: coordinates.y,
      rawGazeX: rawCoordinates.x,
      rawGazeY: rawCoordinates.y,
      isGazeCalibrated: isCalibrated,
      focusScore: focusRawScore ?? undefined,
      focusSource,
      focusIsFocused,
      focusThresholdRawScore,
      isTrackingReady,
      page: 'solo',
    },
  });

  const finishSession = async () => {
    if (isFinishing) return;
    setIsFinishing(true);
    stopPublishing();

    try {
      const jobId = await createTrackingAnalysisJob({
        meetingId: soloMeetingId,
        userId: soloUserId,
        page: 'solo',
        reason: 'finish',
      });
      router.push(`/result?jobId=${encodeURIComponent(jobId)}`);
    } catch (error) {
      console.error('Tracking analysis job creation failed:', error);
      router.push('/result');
    }
  };

  return (
    <main className="min-h-screen" style={{ background: 'var(--color-bg)' }}>
      <Navbar />

      <div className="mx-auto max-w-6xl px-6 py-6">
        <div className="mb-5 flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="text-xs font-medium" style={{ color: 'var(--color-brand-600)' }}>실시간 측정</div>
            <h1 className="mt-0.5 text-2xl font-medium" style={{ color: 'var(--color-brand-900)' }}>집중도 분석</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <HeartRateSourceSelector
              value={heartRateSourcePreference}
              onChange={setHeartRateSourcePreference}
              disabled={isFinishing}
              appleWatchConnected={hasAppleWatchConnection}
              className="w-56"
            />
            <button
              type="button"
              onClick={() => setIsPaused((c) => !c)}
              disabled={isFinishing}
              className="rounded-full px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60"
              style={{
                background: isPaused ? 'var(--color-success)' : 'var(--color-warning)',
                color: 'white',
              }}
            >
              <i className={`ti ${isPaused ? 'ti-player-play' : 'ti-player-pause'} text-sm mr-1`} aria-hidden="true" />
              {isPaused ? '재개' : '일시정지'}
            </button>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2 ft-card relative" style={{ padding: '1rem' }}>
            <WebcamView />
            <div className="absolute right-4 top-4 w-52 space-y-2">
              <div className="rounded-xl px-3 py-2.5" style={{ background: 'rgba(255,255,255,0.95)', border: '1px solid var(--color-border)' }}>
                <p className="text-[10px] uppercase" style={{ color: 'var(--color-text-soft)' }}>
                  {isPaused ? 'Paused' : heartRateSource}
                </p>
                <p className="text-2xl font-medium" style={{ color: 'var(--color-danger)' }}>{heartRate > 0 ? heartRate : '--'}</p>
                <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>{heartRateStatus}</p>
              </div>
              <div className="rounded-xl px-3 py-2.5" style={{ background: 'rgba(255,255,255,0.95)', border: '1px solid var(--color-brand-200)' }}>
                <p className="text-[10px] uppercase" style={{ color: 'var(--color-text-soft)' }}>{focusSource} 집중 점수</p>
                <p className="text-2xl font-medium" style={{ color: 'var(--color-brand-600)' }}>{focusDisplayScore}</p>
                <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                  Threshold {focusThresholdDisplay} · {focusStatus}
                </p>
              </div>
              <MinuteHeartRateAverageBox averages={minuteHeartRateAverages} compact />
            </div>
            <canvas id="heartbeatCanvas" className="hidden" />
          </div>

          <aside className="space-y-3">
            <StatusCard label="카메라" status={isPaused ? '일시정지' : '동작 중'} isActive={!isPaused} colorClass="emerald" />
            <StatusCard
              label={`심박수 (${heartRateSource})`}
              status={heartRateStatus}
              isActive={!isPaused && (heartRate > 0 || isHeartRateMeasuring)}
              colorClass="red"
            />
            <StatusCard
              label="시선 추적"
              status={isPaused ? '일시정지' : !isLoaded ? '불러오는 중' : isCalibrated ? '보정 완료' : '보정 필요'}
              isActive={!isPaused && isLoaded && isCalibrated}
              colorClass="blue"
            />

            <button
              onClick={() => void finishSession()}
              disabled={isFinishing}
              className="w-full rounded-xl px-6 py-3 font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-60"
              style={{ background: 'var(--color-brand-500)' }}
            >
              {isFinishing ? '분석 중...' : '측정 종료 + 결과 보기'}
            </button>
          </aside>
        </div>
      </div>

      <GazeDot
        x={rawCoordinates.x}
        y={rawCoordinates.y}
        visible={!isPaused && isLoaded && isCalibrated && rawCoordinates.x > 0 && rawCoordinates.y > 0}
      />
      <GazeCalibrationOverlay
        active={!isPaused && isLoaded && !isCalibrated}
        currentPointIndex={currentCalibrationPointIndex}
        pointClickCount={calibrationPointClickCount}
        clicksPerPoint={clicksPerCalibrationPoint}
        totalPoints={totalCalibrationPoints}
        isBusy={isCalibrationBusy}
        onPointClick={(point) => recordCalibrationPoint(point.xPercent, point.yPercent)}
        onReset={() => void resetCalibration()}
      />
    </main>
  );
}
