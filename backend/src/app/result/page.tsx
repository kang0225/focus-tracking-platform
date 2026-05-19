'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { StudySessionRecord } from '@/types/dashboard';

const STORAGE_KEY = 'focusTracker.sessions';

function ResultContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const jobId = searchParams.get('jobId');
  const [jobStatus, setJobStatus] = useState<'queued' | 'processing' | 'completed' | 'failed' | null>(null);
  const [jobError, setJobError] = useState<string | null>(null);
  const [jobResult, setJobResult] = useState<{
    durationSeconds?: number;
    avgBpm?: number;
    focusRatio?: number;
    summary?: string;
    feedback?: string;
    feedbackSource?: string;
  } | null>(null);
  
  // URL에서 데이터 추출
  const avgBpm = jobResult?.avgBpm ?? parseInt(searchParams.get('avgBpm') || '0');
  const focusRatio = jobResult?.focusRatio ?? parseInt(searchParams.get('focusRatio') || '0');
  const time = jobResult?.durationSeconds ?? parseInt(searchParams.get('time') || '0');

  // 데이터 계산
  const minutes = Math.floor(time / 60);
  const seconds = time % 60;
  const unfocusRatio = 100 - focusRatio;
  const bpmStatus = avgBpm < 60 ? '낮음' : avgBpm > 100 ? '높음' : '정상';
  const bpmStatusColor = avgBpm < 60 ? 'text-blue-400' : avgBpm > 100 ? 'text-red-400' : 'text-emerald-400';
  const sessionId = `${time}-${focusRatio}-${avgBpm}`;
  const isWaitingForJob = !!jobId && jobStatus !== 'completed' && jobStatus !== 'failed';
  const feedbackSourceLabel = jobResult?.feedbackSource === 'bedrock'
    ? 'LLM 피드백'
    : jobResult?.feedbackSource === 'local_fallback'
      ? '기본 분석 피드백'
      : '학습 피드백';

  useEffect(() => {
    if (!jobId) return undefined;

    let cancelled = false;
    const loadStatus = async () => {
      try {
        const response = await fetch(`/api/tracking/jobs/${encodeURIComponent(jobId)}`);
        const payload = await response.json().catch(() => null) as {
          status?: 'queued' | 'processing' | 'completed' | 'failed';
          result?: typeof jobResult;
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
      } catch (error) {
        if (!cancelled) {
          setJobStatus('failed');
          setJobError(error instanceof Error ? error.message : '분석 작업 상태를 확인하지 못했습니다.');
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

  useEffect(() => {
    if (time <= 0 && focusRatio <= 0 && avgBpm <= 0) return;

    const record: StudySessionRecord = {
      id: sessionId,
      createdAt: Date.now(),
      durationSeconds: time,
      focusRatio,
      avgBpm,
    };

    const stored = window.localStorage.getItem(STORAGE_KEY);
    let sessions: StudySessionRecord[] = [];
    try {
      sessions = stored ? JSON.parse(stored) : [];
    } catch {
      sessions = [];
    }
    const nextSessions = [
      record,
      ...sessions.filter((session) => session.id !== record.id),
    ].slice(0, 30);

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextSessions));
  }, [avgBpm, focusRatio, sessionId, time]);

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 text-white">
      {/* 헤더 */}
      <div className="border-b border-slate-700/50 bg-slate-950/50 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6">
          <div>
            <h1 className="text-3xl font-bold">학습 분석 리포트</h1>
            <p className="text-slate-400">세션 분석 결과</p>
          </div>
          <button
            onClick={() => router.push('/')}
            className="rounded-lg bg-slate-700/50 px-4 py-2 text-sm font-medium transition hover:bg-slate-600"
          >
            ← 메인으로
          </button>
        </div>
      </div>

      {/* 메인 컨텐츠 */}
      <div className="mx-auto max-w-7xl px-6 py-12">
        {jobId && (
          <div className={`mb-8 rounded-2xl p-6 ring-1 backdrop-blur-sm ${
            jobStatus === 'failed'
              ? 'bg-rose-950/40 ring-rose-500/30'
              : jobStatus === 'completed'
                ? 'bg-emerald-950/30 ring-emerald-500/30'
                : 'bg-slate-900/80 ring-cyan-500/20'
          }`}>
            <p className="text-sm font-semibold text-slate-200">
              {jobStatus === 'completed'
                ? '분석 완료'
                : jobStatus === 'failed'
                  ? '분석 작업 확인 실패'
                  : '분석 중'}
            </p>
            <p className="mt-2 text-sm text-slate-400">
              {jobStatus === 'completed'
                ? 'Redis 분석 결과를 불러왔습니다.'
                : jobStatus === 'failed'
                  ? jobError
                  : `작업 ID ${jobId} 상태를 확인하는 중입니다.`}
            </p>
          </div>
        )}

        {isWaitingForJob && (
          <div className="rounded-2xl bg-slate-900/70 p-10 text-center ring-1 ring-slate-600/50">
            <p className="text-2xl font-bold text-white">학습 데이터를 분석하고 있습니다.</p>
            <p className="mt-3 text-sm text-slate-400">Redis에 등록된 job이 완료되면 결과가 여기에 표시됩니다.</p>
          </div>
        )}

        {!isWaitingForJob && (
          <>
        {/* 핵심 지표 3개 */}
        <div className="mb-12 grid gap-6 lg:grid-cols-3">
          {/* 학습 시간 */}
          <div className="rounded-2xl bg-gradient-to-br from-cyan-900/30 to-slate-900/70 p-8 ring-1 ring-cyan-500/20 backdrop-blur-sm">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm uppercase tracking-wider text-slate-400">총 학습 시간</p>
                <p className="mt-2 text-4xl font-bold text-cyan-400">
                  {minutes}
                  <span className="text-2xl">분</span>
                </p>
                <p className="mt-1 text-xs text-slate-500">{seconds}초</p>
              </div>
              <div className="text-5xl opacity-20">⏱️</div>
            </div>
          </div>

          {/* 평균 심박수 */}
          <div className="rounded-2xl bg-gradient-to-br from-red-900/30 to-slate-900/70 p-8 ring-1 ring-red-500/20 backdrop-blur-sm">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm uppercase tracking-wider text-slate-400">평균 심박수</p>
                <p className={`mt-2 text-4xl font-bold ${avgBpm > 100 ? 'text-red-400' : avgBpm < 60 ? 'text-blue-400' : 'text-emerald-400'}`}>
                  {avgBpm}
                  <span className="text-xl">bpm</span>
                </p>
                <p className={`mt-1 text-xs font-medium ${bpmStatusColor}`}>{bpmStatus}</p>
              </div>
              <div className="text-5xl opacity-20">❤️</div>
            </div>
          </div>

          {/* 집중도 점수 */}
          <div className="rounded-2xl bg-gradient-to-br from-blue-900/30 to-slate-900/70 p-8 ring-1 ring-blue-500/20 backdrop-blur-sm">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm uppercase tracking-wider text-slate-400">집중도 점수</p>
                <p className="mt-2 text-4xl font-bold text-blue-400">{focusRatio}%</p>
                <p className="mt-1 text-xs text-slate-500">학습 중 집중 유지</p>
              </div>
              <div className="text-5xl opacity-20">🎯</div>
            </div>
          </div>
        </div>

        {/* 상세 분석 영역 */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* 집중도 분석 */}
          <div className="rounded-2xl bg-slate-900/70 p-8 ring-1 ring-slate-600/50 backdrop-blur-sm">
            <h2 className="mb-6 text-xl font-semibold">집중도 분석</h2>
            
            {/* 집중 시간 진행 바 */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-slate-400">집중 시간</span>
                <span className="font-mono text-sm font-bold text-blue-400">{focusRatio}%</span>
              </div>
              <div className="h-3 w-full overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 transition-all duration-500"
                  style={{ width: `${focusRatio}%` }}
                />
              </div>
            </div>

            {/* 산만 시간 진행 바 */}
            <div className="mb-8">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-slate-400">산만 시간</span>
                <span className="font-mono text-sm font-bold text-slate-500">{unfocusRatio}%</span>
              </div>
              <div className="h-3 w-full overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full bg-gradient-to-r from-slate-600 to-slate-500 transition-all duration-500"
                  style={{ width: `${unfocusRatio}%` }}
                />
              </div>
            </div>

            {/* 집중도 평가 */}
            <div className="rounded-lg bg-slate-800/50 px-4 py-3">
              <p className="text-xs uppercase tracking-wider text-slate-400 mb-1">평가</p>
              <p className="font-semibold">
                {focusRatio >= 80
                  ? '🌟 탁월한 집중력! 매우 좋은 학습 세션입니다.'
                  : focusRatio >= 60
                    ? '✅ 좋은 집중력을 유지하고 있습니다.'
                    : focusRatio >= 40
                      ? '⚠️ 집중력 개선이 필요합니다.'
                      : '❌ 집중력 향상을 위한 노력이 필요합니다.'}
              </p>
            </div>
          </div>

          {/* 심박수 분석 */}
          <div className="rounded-2xl bg-slate-900/70 p-8 ring-1 ring-slate-600/50 backdrop-blur-sm">
            <h2 className="mb-6 text-xl font-semibold">심박수 분석</h2>
            
            {/* 심박수 상태 */}
            <div className="mb-8 space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-2 w-2 rounded-full bg-blue-400"></div>
                <span className="text-sm text-slate-400">정상 범위: 60~100 bpm</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="h-2 w-2 rounded-full bg-red-400"></div>
                <span className="text-sm text-slate-400">상승: 100 bpm 이상</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="h-2 w-2 rounded-full bg-cyan-400"></div>
                <span className="text-sm text-slate-400">낮음: 60 bpm 이하</span>
              </div>
            </div>

            {/* 심박수 평가 */}
            <div className="rounded-lg bg-slate-800/50 px-4 py-3">
              <p className="text-xs uppercase tracking-wider text-slate-400 mb-1">상태</p>
              <p className="font-semibold">
                {avgBpm < 60
                  ? '🧘 이완 상태입니다. 편안한 학습 환경을 유지하세요.'
                  : avgBpm <= 100
                    ? '✅ 정상 범위입니다. 건강한 학습 상태입니다.'
                    : '⚡ 스트레스 상태입니다. 휴식을 취해보세요.'}
              </p>
            </div>
          </div>
        </div>

        {jobResult?.feedback && (
          <div className="mt-6 rounded-2xl bg-emerald-900/20 p-8 ring-1 ring-emerald-500/20 backdrop-blur-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">AI 학습 코치 피드백</h2>
              <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-200 ring-1 ring-emerald-400/20">
                {feedbackSourceLabel}
              </span>
            </div>
            <p className="whitespace-pre-line leading-7 text-slate-200">
              {jobResult.feedback}
            </p>
          </div>
        )}

        {/* 권장사항 */}
        <div className="mt-6 rounded-2xl bg-blue-900/20 p-8 ring-1 ring-blue-500/20 backdrop-blur-sm">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
            <span>💡</span>
            <span>학습 개선 팁</span>
          </h2>
          <ul className="space-y-3 text-slate-300">
            {focusRatio < 70 && (
              <li className="flex gap-3">
                <span className="text-blue-400">•</span>
                <span>산만함이 감지되었습니다. 주변 환경을 정리하고, 집중에 방해되는 요소를 제거해보세요.</span>
              </li>
            )}
            {avgBpm > 100 && (
              <li className="flex gap-3">
                <span className="text-red-400">•</span>
                <span>심박수가 높습니다. 깊은 호흡을 하고, 5-10분 휴식을 취해보세요.</span>
              </li>
            )}
            {avgBpm < 60 && (
              <li className="flex gap-3">
                <span className="text-cyan-400">•</span>
                <span>매우 차분한 상태입니다. 에너지 레벨을 높이기 위해 스트레칭을 해보세요.</span>
              </li>
            )}
            <li className="flex gap-3">
              <span className="text-emerald-400">•</span>
              <span>규칙적인 학습 세션으로 최적의 습관을 만들어보세요.</span>
            </li>
          </ul>
        </div>

        {/* 버튼 */}
        <div className="mt-8 flex gap-4 justify-end">
          <button
            onClick={() => router.push('/dashboard')}
            className="rounded-lg border border-slate-600 px-6 py-3 font-semibold text-slate-200 transition hover:bg-slate-800"
          >
            대시보드 보기
          </button>
          <button
            onClick={() => router.push('/')}
            className="rounded-lg bg-gradient-to-r from-blue-600 to-cyan-600 px-6 py-3 font-semibold shadow-lg shadow-blue-500/20 transition hover:shadow-lg hover:shadow-blue-400/40"
          >
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
    <Suspense fallback={<div>Loading...</div>}>
      <ResultContent />
    </Suspense>
  );
}
