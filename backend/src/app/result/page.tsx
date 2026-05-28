'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import Navbar from '@/components/Navbar';

interface GazeHeatmapCell {
  column: number;
  row: number;
  x: number;
  y: number;
  count: number;
  intensity: number;
}

interface GazeHeatmap {
  columns: number;
  rows: number;
  totalPoints: number;
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
  cells: GazeHeatmapCell[];
}

interface FocusTimelinePoint {
  minuteIndex: number;
  elapsedSeconds: number;
  focusScore?: number;
  threshold?: number;
  focusState: string;
  focusTrend: string;
}

interface JobResult {
  durationSeconds?: number;
  avgBpm?: number;
  focusRatio?: number;
  summary?: string;
  feedback?: string;
  feedback2?: string;
  feedbackSource?: string;
  gazeHeatmap?: GazeHeatmap;
  focusTimeline?: FocusTimelinePoint[];
}

function formatNumber(value?: number) {
  if (typeof value !== 'number') return '--';
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatElapsed(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest === 0 ? `${minutes}분` : `${minutes}분 ${rest}초`;
}

function GazeHeatmapChart({ heatmap }: { heatmap?: GazeHeatmap }) {
  const cells = heatmap?.cells ?? [];

  return (
    <div className="ft-card">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-medium" style={{ color: 'var(--color-brand-900)' }}>시선 분포 히트맵</h2>
          <p className="mt-0.5 text-xs" style={{ color: 'var(--color-text-soft)' }}>gazeX, gazeY가 머문 위치 분포</p>
        </div>
        <span className="rounded-full px-2.5 py-1 text-[11px] font-medium" style={{ background: 'var(--color-brand-50)', color: 'var(--color-brand-700)' }}>
          {heatmap?.totalPoints ?? 0} samples
        </span>
      </div>

      <div className="relative aspect-[16/10] overflow-hidden rounded-xl" style={{ background: 'var(--color-bg-soft)', border: '1px solid var(--color-border)' }}>
        <div
          className="absolute inset-0 opacity-50"
          style={{
            backgroundImage:
              'linear-gradient(rgba(148,163,184,0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.12) 1px, transparent 1px)',
            backgroundSize: '10% 10%',
          }}
        />
        {cells.length > 0 ? (
          cells.map((cell) => {
            const size = 18 + cell.intensity * 58;
            const opacity = 0.25 + cell.intensity * 0.65;
            const color = cell.intensity > 0.66
              ? 'rgba(239, 68, 68, 0.85)'
              : cell.intensity > 0.33
                ? 'rgba(14, 165, 233, 0.85)'
                : 'rgba(56, 189, 248, 0.7)';

            return (
              <div
                key={`${cell.column}-${cell.row}`}
                className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full blur-md"
                title={`${cell.count} samples`}
                style={{
                  left: `${cell.x}%`,
                  top: `${cell.y}%`,
                  width: size,
                  height: size,
                  opacity,
                  background: color,
                }}
              />
            );
          })
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-sm" style={{ color: 'var(--color-text-muted)' }}>
            유효한 시선 좌표가 없습니다.
          </div>
        )}
      </div>

      <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2" style={{ color: 'var(--color-text-soft)' }}>
        <div className="rounded-md px-2.5 py-1.5" style={{ background: 'var(--color-bg-soft)' }}>
          X 범위 {formatNumber(heatmap?.xMin)} - {formatNumber(heatmap?.xMax)}
        </div>
        <div className="rounded-md px-2.5 py-1.5" style={{ background: 'var(--color-bg-soft)' }}>
          Y 범위 {formatNumber(heatmap?.yMin)} - {formatNumber(heatmap?.yMax)}
        </div>
      </div>
    </div>
  );
}

function FocusTimelineChart({ timeline }: { timeline?: FocusTimelinePoint[] }) {
  const chart = useMemo(() => {
    const points = (timeline ?? []).filter((p) => typeof p.focusScore === 'number');
    if (points.length === 0) return null;

    const width = 680;
    const height = 260;
    const padding = { top: 24, right: 18, bottom: 38, left: 48 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;
    const scoreValues = points.map((p) => p.focusScore as number);
    const thresholdValues = points
      .map((p) => p.threshold)
      .filter((v): v is number => typeof v === 'number');
    const values = [...scoreValues, ...thresholdValues];
    const rawMin = Math.min(...values);
    const rawMax = Math.max(...values);
    const paddingValue = Math.max((rawMax - rawMin) * 0.18, 1);
    const yMin = rawMin - paddingValue;
    const yMax = rawMax + paddingValue;
    const elapsedValues = points.map((p) => p.elapsedSeconds);
    const xMin = Math.min(...elapsedValues);
    const xMax = Math.max(...elapsedValues);
    const xSpan = Math.max(xMax - xMin, 1);
    const ySpan = Math.max(yMax - yMin, 1);
    const xFor = (es: number) => padding.left + ((es - xMin) / xSpan) * chartWidth;
    const yFor = (sc: number) => padding.top + (1 - ((sc - yMin) / ySpan)) * chartHeight;
    const line = points
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xFor(p.elapsedSeconds).toFixed(2)} ${yFor(p.focusScore as number).toFixed(2)}`)
      .join(' ');
    const baseline = padding.top + chartHeight;
    const area = `${line} L ${xFor(points[points.length - 1].elapsedSeconds).toFixed(2)} ${baseline} L ${xFor(points[0].elapsedSeconds).toFixed(2)} ${baseline} Z`;
    const thresholdLine = thresholdValues.length > 0
      ? points
        .filter((p) => typeof p.threshold === 'number')
        .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xFor(p.elapsedSeconds).toFixed(2)} ${yFor(p.threshold as number).toFixed(2)}`)
        .join(' ')
      : null;

    return {
      area, height, line, padding, points, thresholdLine, width,
      xEndLabel: formatElapsed(xMax),
      xStartLabel: formatElapsed(xMin),
      xFor, yFor, yMax, yMin,
    };
  }, [timeline]);

  return (
    <div className="ft-card">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-medium" style={{ color: 'var(--color-brand-900)' }}>집중도 흐름</h2>
          <p className="mt-0.5 text-xs" style={{ color: 'var(--color-text-soft)' }}>분 단위 집중도 점수</p>
        </div>
        <span className="rounded-full px-2.5 py-1 text-[11px] font-medium" style={{ background: 'var(--color-brand-50)', color: 'var(--color-brand-700)' }}>
          {timeline?.length ?? 0} minutes
        </span>
      </div>

      {chart ? (
        <div className="overflow-hidden rounded-xl py-2" style={{ background: 'var(--color-bg-soft)', border: '1px solid var(--color-border)' }}>
          <svg viewBox={`0 0 ${chart.width} ${chart.height}`} className="h-auto w-full" role="img" aria-label="집중도 꺾은선 그래프">
            {[0, 1, 2, 3].map((i) => {
              const y = chart.padding.top + ((chart.height - chart.padding.top - chart.padding.bottom) / 3) * i;
              return <line key={i} x1={chart.padding.left} x2={chart.width - chart.padding.right} y1={y} y2={y} stroke="rgba(148, 163, 184, 0.18)" strokeWidth="1" />;
            })}
            <path d={chart.area} fill="rgba(14, 165, 233, 0.12)" />
            {chart.thresholdLine && (
              <path d={chart.thresholdLine} fill="none" stroke="rgba(239, 68, 68, 0.7)" strokeDasharray="7 7" strokeLinecap="round" strokeWidth="2" />
            )}
            <path d={chart.line} fill="none" stroke="#0EA5E9" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
            {chart.points.map((p) => (
              <circle
                key={`${p.minuteIndex}-${p.elapsedSeconds}`}
                cx={chart.xFor(p.elapsedSeconds)}
                cy={chart.yFor(p.focusScore as number)}
                fill={p.focusState === 'high_focus' ? '#16A34A' : '#0EA5E9'}
                r="4"
              />
            ))}
            <text x="8" y={chart.padding.top + 4} fill="#94A3B8" fontSize="11">{formatNumber(chart.yMax)}</text>
            <text x="8" y={chart.height - chart.padding.bottom} fill="#94A3B8" fontSize="11">{formatNumber(chart.yMin)}</text>
            <text x={chart.padding.left} y={chart.height - 10} fill="#94A3B8" fontSize="11">{chart.xStartLabel}</text>
            <text x={chart.width - chart.padding.right} y={chart.height - 10} fill="#94A3B8" fontSize="11" textAnchor="end">{chart.xEndLabel}</text>
          </svg>
        </div>
      ) : (
        <div className="flex aspect-[16/10] items-center justify-center rounded-xl text-sm" style={{ background: 'var(--color-bg-soft)', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}>
          집중도 타임라인 데이터가 없습니다.
        </div>
      )}
    </div>
  );
}

function ResultContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const jobId = searchParams.get('jobId');
  const [jobStatus, setJobStatus] = useState<'queued' | 'processing' | 'completed' | 'failed' | null>(null);
  const [jobError, setJobError] = useState<string | null>(null);
  const [jobResult, setJobResult] = useState<JobResult | null>(null);

  const avgBpm = jobResult?.avgBpm ?? parseInt(searchParams.get('avgBpm') || '0');
  const focusRatio = jobResult?.focusRatio ?? parseInt(searchParams.get('focusRatio') || '0');
  const time = jobResult?.durationSeconds ?? parseInt(searchParams.get('time') || '0');

  const minutes = Math.floor(time / 60);
  const seconds = time % 60;
  const unfocusRatio = 100 - focusRatio;
  const bpmStatus = avgBpm < 60 ? '낮음' : avgBpm > 100 ? '높음' : '정상';
  const bpmColor = avgBpm < 60 ? 'var(--color-brand-500)' : avgBpm > 100 ? 'var(--color-danger)' : 'var(--color-success)';
  const isWaitingForJob = !!jobId && jobStatus !== 'completed' && jobStatus !== 'failed';
  const hasCompletedJobResult = !!jobId && jobStatus === 'completed' && !!jobResult;
  const hasLegacyQueryResult = !jobId && (time > 0 || focusRatio > 0 || avgBpm > 0);
  const shouldShowReport = hasCompletedJobResult || hasLegacyQueryResult;
  const coachLabel = jobResult?.feedbackSource === 'bedrock' ? 'LLM 피드백' : '생성 안 됨';
  const coachText = jobResult?.feedback2 ?? 'AI 피드백을 생성하지 못했습니다. 기본 분석 요약을 참고해주세요.';

  useEffect(() => {
    if (!jobId) return undefined;
    let cancelled = false;
    const loadStatus = async () => {
      try {
        const response = await fetch(`/api/tracking/jobs/${encodeURIComponent(jobId)}`);
        const payload = await response.json().catch(() => null) as {
          status?: 'queued' | 'processing' | 'completed' | 'failed';
          result?: JobResult;
          error?: string;
        } | null;
        if (cancelled) return;
        if (!response.ok || !payload?.status) {
          setJobStatus('failed');
          setJobError(payload?.error ?? '분석 작업 상태를 확인하지 못했습니다.');
          return;
        }
        setJobStatus(payload.status);
        setJobError(payload.error ?? null);
        if (payload.result) setJobResult(payload.result);
      } catch (err) {
        if (!cancelled) {
          setJobStatus('failed');
          setJobError(err instanceof Error ? err.message : '분석 작업 상태를 확인하지 못했습니다.');
        }
      }
    };
    void loadStatus();
    const interval = window.setInterval(loadStatus, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [jobId]);

  return (
    <main className="min-h-screen" style={{ background: 'var(--color-bg)' }}>
      <Navbar />

      <div className="mx-auto max-w-5xl px-6 py-6">
        <div className="mb-5">
          <div className="text-xs font-medium" style={{ color: 'var(--color-brand-600)' }}>학습 리포트</div>
          <h1 className="mt-0.5 text-2xl font-medium" style={{ color: 'var(--color-brand-900)' }}>세션 분석 결과</h1>
        </div>

        {jobId && (
          <div className="ft-card mb-4" style={{
            background: jobStatus === 'failed' ? '#FEF2F2' : jobStatus === 'completed' ? '#F0FDF4' : 'var(--color-brand-50)',
            borderColor: jobStatus === 'failed' ? '#FECACA' : jobStatus === 'completed' ? '#BBF7D0' : 'var(--color-brand-200)',
          }}>
            <p className="text-sm font-medium" style={{
              color: jobStatus === 'failed' ? '#B91C1C' : jobStatus === 'completed' ? '#15803D' : 'var(--color-brand-700)',
            }}>
              {jobStatus === 'completed' ? '분석 완료' : jobStatus === 'failed' ? '분석 실패' : '분석 중...'}
            </p>
            <p className="mt-1 text-xs" style={{ color: 'var(--color-text-soft)' }}>
              {jobStatus === 'completed' ? '결과를 불러왔습니다.' : jobStatus === 'failed' ? jobError : `작업 ID ${jobId} 처리 중입니다.`}
            </p>
          </div>
        )}

        {isWaitingForJob && (
          <div className="ft-card text-center py-12">
            <i className="ti ti-loader-2 animate-spin text-3xl" aria-hidden="true" style={{ color: 'var(--color-brand-500)' }} />
            <p className="mt-3 text-lg font-medium" style={{ color: 'var(--color-brand-900)' }}>데이터를 분석하고 있어요</p>
            <p className="mt-1 text-sm" style={{ color: 'var(--color-text-soft)' }}>잠시만 기다려주세요...</p>
          </div>
        )}

        {!isWaitingForJob && !shouldShowReport && (
          <div className="ft-card text-center py-12">
            <i className="ti ti-mood-empty text-3xl" aria-hidden="true" style={{ color: 'var(--color-text-muted)' }} />
            <p className="mt-3 text-lg font-medium" style={{ color: 'var(--color-brand-900)' }}>분석할 데이터가 없어요</p>
            <p className="mt-1 text-sm" style={{ color: 'var(--color-text-soft)' }}>측정을 진행한 뒤 다시 결과를 확인해주세요.</p>
            <button onClick={() => router.push('/measure')} className="ft-btn-primary mt-4">측정 시작</button>
          </div>
        )}

        {shouldShowReport && (
          <>
            <section className="mb-5 grid gap-3 lg:grid-cols-3">
              <div className="ft-card">
                <p className="text-xs uppercase tracking-wider" style={{ color: 'var(--color-text-soft)' }}>총 학습 시간</p>
                <p className="mt-1.5 text-3xl font-medium" style={{ color: 'var(--color-brand-600)' }}>
                  {minutes}<span className="text-xl ml-1">분</span>
                </p>
                <p className="mt-0.5 text-xs" style={{ color: 'var(--color-text-muted)' }}>{seconds}초</p>
              </div>
              <div className="ft-card">
                <p className="text-xs uppercase tracking-wider" style={{ color: 'var(--color-text-soft)' }}>평균 심박수</p>
                <p className="mt-1.5 text-3xl font-medium" style={{ color: bpmColor }}>
                  {avgBpm}<span className="text-base ml-1">bpm</span>
                </p>
                <p className="mt-0.5 text-xs font-medium" style={{ color: bpmColor }}>{bpmStatus}</p>
              </div>
              <div className="ft-card">
                <p className="text-xs uppercase tracking-wider" style={{ color: 'var(--color-text-soft)' }}>집중도 점수</p>
                <p className="mt-1.5 text-3xl font-medium" style={{ color: 'var(--color-brand-600)' }}>{focusRatio}%</p>
                <p className="mt-0.5 text-xs" style={{ color: 'var(--color-text-muted)' }}>학습 중 집중 유지</p>
              </div>
            </section>

            <div className="mb-5 grid gap-3 lg:grid-cols-2">
              <GazeHeatmapChart heatmap={jobResult?.gazeHeatmap} />
              <FocusTimelineChart timeline={jobResult?.focusTimeline} />
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              <div className="ft-card">
                <h2 className="mb-4 text-base font-medium" style={{ color: 'var(--color-brand-900)' }}>집중도 분석</h2>

                <div className="mb-4">
                  <div className="mb-1.5 flex justify-between text-xs">
                    <span style={{ color: 'var(--color-text-soft)' }}>집중 시간</span>
                    <span className="font-medium" style={{ color: 'var(--color-brand-600)' }}>{focusRatio}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full" style={{ background: 'var(--color-brand-100)' }}>
                    <div className="h-full transition-all duration-500" style={{ width: `${focusRatio}%`, background: 'var(--color-brand-500)' }} />
                  </div>
                </div>

                <div className="mb-5">
                  <div className="mb-1.5 flex justify-between text-xs">
                    <span style={{ color: 'var(--color-text-soft)' }}>산만 시간</span>
                    <span className="font-medium" style={{ color: 'var(--color-text-muted)' }}>{unfocusRatio}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full" style={{ background: 'var(--color-bg-soft)' }}>
                    <div className="h-full transition-all duration-500" style={{ width: `${unfocusRatio}%`, background: 'var(--color-text-muted)' }} />
                  </div>
                </div>

                <div className="rounded-lg px-3 py-2.5" style={{ background: 'var(--color-brand-50)' }}>
                  <p className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: 'var(--color-brand-600)' }}>평가</p>
                  <p className="text-sm font-medium" style={{ color: 'var(--color-brand-900)' }}>
                    {focusRatio >= 80 ? '탁월한 집중력! 매우 좋은 학습 세션입니다.'
                      : focusRatio >= 60 ? '좋은 집중력을 유지하고 있습니다.'
                      : focusRatio >= 40 ? '집중력 개선이 필요합니다.'
                      : '집중력 향상을 위한 노력이 필요합니다.'}
                  </p>
                </div>
              </div>

              <div className="ft-card">
                <h2 className="mb-4 text-base font-medium" style={{ color: 'var(--color-brand-900)' }}>심박수 분석</h2>

                <div className="mb-5 space-y-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--color-success)' }} />
                    <span style={{ color: 'var(--color-text-soft)' }}>정상 범위: 60~100 bpm</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--color-danger)' }} />
                    <span style={{ color: 'var(--color-text-soft)' }}>상승: 100 bpm 이상</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--color-brand-500)' }} />
                    <span style={{ color: 'var(--color-text-soft)' }}>낮음: 60 bpm 이하</span>
                  </div>
                </div>

                <div className="rounded-lg px-3 py-2.5" style={{ background: 'var(--color-brand-50)' }}>
                  <p className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: 'var(--color-brand-600)' }}>상태</p>
                  <p className="text-sm font-medium" style={{ color: 'var(--color-brand-900)' }}>
                    {avgBpm < 60 ? '이완 상태입니다. 편안한 환경을 유지하세요.'
                      : avgBpm <= 100 ? '정상 범위. 건강한 학습 상태입니다.'
                      : '스트레스 상태입니다. 휴식을 권장합니다.'}
                  </p>
                </div>
              </div>
            </div>

            {jobResult?.feedback && (
              <div className="ft-card mt-4">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-base font-medium" style={{ color: 'var(--color-brand-900)' }}>학습 요약</h2>
                  <span className="rounded-full px-2.5 py-1 text-[10px] font-medium" style={{ background: 'var(--color-brand-50)', color: 'var(--color-brand-700)' }}>
                    기본 분석
                  </span>
                </div>
                <p className="whitespace-pre-line text-sm leading-relaxed" style={{ color: 'var(--color-text)' }}>{jobResult.feedback}</p>
              </div>
            )}

            {jobResult && (
              <div className="ft-card mt-4">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-base font-medium" style={{ color: 'var(--color-brand-900)' }}>
                    <i className="ti ti-sparkles mr-1" aria-hidden="true" />
                    AI 학습 코치 피드백
                  </h2>
                  <span className="rounded-full px-2.5 py-1 text-[10px] font-medium" style={{ background: 'var(--color-brand-50)', color: 'var(--color-brand-700)' }}>
                    {coachLabel}
                  </span>
                </div>
                <p className="whitespace-pre-line text-sm leading-relaxed" style={{ color: 'var(--color-text)' }}>{coachText}</p>
              </div>
            )}

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button onClick={() => router.push('/dashboard')} className="ft-btn-secondary">
                대시보드 보기
              </button>
              <button onClick={() => router.push('/measure')} className="ft-btn-primary">
                <i className="ti ti-player-play text-sm" aria-hidden="true" />
                새 세션 시작
              </button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}

export default function ResultPage() {
  return (
    <Suspense fallback={<main className="min-h-screen" style={{ background: 'var(--color-bg)' }} />}>
      <ResultContent />
    </Suspense>
  );
}
