'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import WebcamView from '../components/WebcamView';
import { GazeCalibrationOverlay } from '@/components/GazeCalibrationOverlay';
import GazeDot from '../components/GazeDot';
import { StatusCard } from '../components/StatusCard';
import { MinuteHeartRateAverageBox } from '@/components/MinuteHeartRateAverageBox';
import { useConcentrationData } from '@/hooks/useConcentrationData';
import { useTrackingAnalysisJob } from '@/hooks/useTrackingAnalysisJob';
import { useMinuteHeartRateAverages } from '@/hooks/useMinuteHeartRateAverages';
import { useTrackingStreamPublisher } from '@/hooks/useTrackingStreamPublisher';

function makeTrackingId(prefix: string) {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export default function HomePage() {
  const router = useRouter();
  const createTrackingAnalysisJob = useTrackingAnalysisJob();
  const [isFinishing, setIsFinishing] = useState(false);
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
  } = useConcentrationData();
  const minuteHeartRateAverages = useMinuteHeartRateAverages(heartRate, heartRate > 0 || isHeartRateMeasuring);
  const focusDisplayScore = focusRawScore != null ? focusRawScore.toFixed(3) : '--';

  const { stopPublishing } = useTrackingStreamPublisher({
    enabled: isLoaded,
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
      focusIsFocused,
      focusThresholdRawScore,
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
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 p-6 text-white">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Focus Tracking</h1>
            <p className="text-slate-400">Real-time concentration monitoring dashboard</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => router.push('/dashboard')}
              className="rounded-lg border border-slate-600 px-6 py-3 font-semibold text-slate-200 transition hover:bg-slate-800"
            >
              Dashboard
            </button>
            <button
              onClick={() => router.push('/room')}
              className="rounded-lg bg-cyan-600 px-6 py-3 font-semibold shadow-lg shadow-cyan-500/20 transition hover:bg-cyan-500 hover:shadow-cyan-400/40"
            >
              Focus Room
            </button>
            <button
              onClick={() => router.push('/tracker')}
              className="rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 px-6 py-3 font-semibold shadow-lg shadow-blue-500/20 transition hover:shadow-lg hover:shadow-blue-400/40"
            >
              Apple Watch Sync
            </button>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <div className="relative rounded-2xl bg-slate-900/70 p-6 shadow-2xl ring-1 ring-white/5">
              <WebcamView />

              <div className="absolute right-6 top-6 w-52 space-y-2">
                <div className="rounded-xl bg-slate-950/90 px-4 py-3 ring-1 ring-slate-600/50">
                  <p className="text-[10px] uppercase text-slate-400">{heartRateSource}</p>
                  <p className="text-3xl font-bold text-red-400">{heartRate > 0 ? heartRate : '--'}</p>
                  <p className="text-[10px] text-slate-500">{heartRateStatus}</p>
                </div>
                <div className="rounded-xl bg-slate-950/90 px-4 py-3 ring-1 ring-emerald-500/30">
                  <p className="text-[10px] uppercase text-slate-400">rPPG 집중도 원점수</p>
                  <p className="text-3xl font-bold text-emerald-300">{focusDisplayScore}</p>
                  <p className="text-[10px] text-slate-500">
                    {focusRawScore != null ? 'PPI 기반 판정 중' : 'PPI 수집 중'}
                  </p>
                </div>
                <MinuteHeartRateAverageBox averages={minuteHeartRateAverages} compact />
              </div>
              <canvas id="heartbeatCanvas" className="hidden" />
            </div>
          </div>

          <aside className="space-y-4">
            <StatusCard label="Camera" status="Active" isActive={true} colorClass="emerald" />
            <StatusCard
              label={`Heart Rate (${heartRateSource})`}
              status={heartRateStatus}
              isActive={heartRate > 0 || isHeartRateMeasuring}
              colorClass="red"
            />
            <StatusCard
              label="Gaze Tracking"
              status={!isLoaded ? 'Loading' : isCalibrated ? 'Calibrated' : 'Calibration required'}
              isActive={isLoaded && isCalibrated}
              colorClass="blue"
            />

            <button
              onClick={() => void finishSession()}
              disabled={isFinishing}
              className="w-full rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 px-6 py-3 font-semibold shadow-lg shadow-cyan-500/20 transition hover:shadow-lg hover:shadow-cyan-400/40 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isFinishing ? 'Analyzing...' : 'View Results'}
            </button>
          </aside>
        </div>
      </div>
      <GazeDot
        x={rawCoordinates.x}
        y={rawCoordinates.y}
        visible={isLoaded && isCalibrated && rawCoordinates.x > 0 && rawCoordinates.y > 0}
      />
      <GazeCalibrationOverlay
        active={isLoaded && !isCalibrated}
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
