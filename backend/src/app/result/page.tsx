'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function ResultContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  // URL에서 데이터 추출
  const avgBpm = parseInt(searchParams.get('avgBpm') || '0');
  const focusRatio = parseInt(searchParams.get('focusRatio') || '0');
  const time = parseInt(searchParams.get('time') || '0');

  // 데이터 계산
  const minutes = Math.floor(time / 60);
  const seconds = time % 60;
  const unfocusRatio = 100 - focusRatio;
  const bpmStatus = avgBpm < 60 ? '낮음' : avgBpm > 100 ? '높음' : '정상';
  const bpmStatusColor = avgBpm < 60 ? 'text-blue-400' : avgBpm > 100 ? 'text-red-400' : 'text-emerald-400';

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
            onClick={() => router.push('/')}
            className="rounded-lg bg-gradient-to-r from-blue-600 to-cyan-600 px-6 py-3 font-semibold shadow-lg shadow-blue-500/20 transition hover:shadow-lg hover:shadow-blue-400/40"
          >
            새 세션 시작
          </button>
        </div>
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