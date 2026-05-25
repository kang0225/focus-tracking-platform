'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { HeartRateSourcePreference, PairingData, PairingResponse } from '../../types/tracker';
import WebcamView from '../../components/WebcamView';
import { HeartRateSourceSelector } from '@/components/HeartRateSourceSelector';
import { MinuteHeartRateAverageBox } from '@/components/MinuteHeartRateAverageBox';
import { isRppgMeasuringStatus, useRPPG } from '../../hooks/useRPPG';
import { useMinuteHeartRateAverages } from '@/hooks/useMinuteHeartRateAverages';
import { useRollingHeartRateAverage } from '@/hooks/useRollingHeartRateAverage';

function formatMetric(value: number | null | undefined, digits = 3) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '--';
  return Number.isInteger(value) ? String(value) : value.toFixed(digits);
}

export default function TrackerPage() {
  const router = useRouter();
  const [code, setCode] = useState<string>('');
  const [data, setData] = useState<PairingData | null>(null);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('페어링 버튼을 눌러 6자리 코드를 생성하세요.');
  const [heartRateSourcePreference, setHeartRateSourcePreference] = useState<HeartRateSourcePreference>('webcam');
  const isPaired = !!data && data.status === 'active';
  const hasAppleWatchValues = isPaired
    && (
      (data?.heartRate ?? 0) > 0
      || typeof data?.focusScore === 'number'
      || typeof data?.focusThreshold === 'number'
  );
  const hasAppleWatchConnection = isPaired && (data?.appleWatchPaired === true || hasAppleWatchValues);
  const useAppleWatchMode = heartRateSourcePreference === 'apple-watch';
  const useRPPGMode = heartRateSourcePreference === 'webcam';
  const appleWatchFocusIsFocused = data?.focusIsFocused ?? (
    typeof data?.focusScore === 'number' && typeof data?.focusThreshold === 'number'
      ? data.focusScore >= data.focusThreshold
      : null
  );
  const focusStatus = appleWatchFocusIsFocused == null ? '판정 대기' : appleWatchFocusIsFocused ? '집중 중' : '집중 저하';

  // rPPG 훅 사용
  const { bpm, confidence, status: rppgStatus } = useRPPG('webgazerVideoFeed', useRPPGMode);
  const rawDisplayedHeartRate = useAppleWatchMode ? data?.heartRate ?? 0 : bpm;
  const heartRateAverageSource = useAppleWatchMode ? 'Apple Watch' : 'FacePhys Camera';
  const displayedHeartRate = useRollingHeartRateAverage(rawDisplayedHeartRate, rawDisplayedHeartRate > 0, 10, heartRateAverageSource);
  const isRppgMeasuring = useRPPGMode && isRppgMeasuringStatus(rppgStatus);
  const minuteHeartRateAverages = useMinuteHeartRateAverages(displayedHeartRate, displayedHeartRate > 0 || isRppgMeasuring);

  const generateCode = async () => {
    setLoading(true);
    setStatusMessage('코드를 생성 중입니다...');
    setData(null);

    try {
      const res = await fetch('/api/pair/generate');
      const json: PairingResponse = await res.json();
      if (json?.pairingCode) {
        setCode(json.pairingCode);
        setStatusMessage('아이폰 앱에서 아래 6자리 코드를 입력하세요.');
      } else {
        setStatusMessage('코드 생성에 실패했습니다. 다시 시도해주세요.');
      }
    } catch (err) {
      console.error('코드 생성 실패:', err);
      setStatusMessage('코드 생성에 실패했습니다. 인터넷 연결을 확인하세요.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!code) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/pair/status?code=${code}`);
        if (!res.ok) return;

        const json = await res.json();
        setData(json);
      } catch (err) {
        console.error('상태 확인 실패:', err);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [code]);

  const isWaiting = !!code && (!data || data.status === 'waiting');

  return (
    <main className="flex min-h-screen bg-gray-950 text-white px-4 py-10 sm:px-6">
      <div className="mx-auto w-full max-w-3xl rounded-3xl border border-slate-800 bg-slate-900/95 p-8 shadow-2xl backdrop-blur-xl">
        <button
          onClick={() => router.back()}
          className="mb-8 inline-flex items-center gap-2 text-sm text-slate-400 transition hover:text-white"
        >
          <span>←</span>
          <span>뒤로가기</span>
        </button>

        <div className="mb-10 text-center">
          <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl">FocusTracker Pairing</h1>
          <p className="mt-3 text-sm text-slate-400 sm:text-base">웹캠 또는 Apple Watch를 선택한 뒤 필요한 경우 iPhone 앱과 페어링을 진행하세요.</p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.3fr_0.9fr]">
          <section className="rounded-3xl border border-slate-800 bg-slate-950/80 p-6">
            <div className="flex flex-col gap-4">
              <HeartRateSourceSelector
                value={heartRateSourcePreference}
                onChange={setHeartRateSourcePreference}
                appleWatchConnected={hasAppleWatchConnection}
              />

              <div className="rounded-2xl bg-slate-900/90 p-5 shadow-inner shadow-slate-950/40">
                <p className="text-sm text-slate-400">현재 상태</p>
                <p className="mt-3 text-lg font-semibold text-white">{statusMessage}</p>
              </div>

              <div className="rounded-3xl bg-gradient-to-r from-slate-900 via-slate-950 to-slate-900 p-6 text-center">
                <p className="text-sm uppercase tracking-[0.3em] text-slate-500">Pairing Code</p>
                <div className="mt-6 flex items-center justify-center gap-3 rounded-3xl border border-slate-700 bg-slate-900 px-5 py-6 text-5xl font-black text-blue-400 shadow-lg shadow-blue-500/10">
                  {code || '------'}
                </div>
                <p className="mt-4 text-sm text-slate-500">아이폰 앱에서 위 코드를 입력하면 페어링이 시작됩니다.</p>
                <p className="mt-2 text-xs text-slate-500">Apple Watch는 선택 사항이며, 없어도 기본 연결은 가능합니다.</p>
              </div>

              <button
                type="button"
                onClick={generateCode}
                disabled={loading}
                className="mt-5 w-full rounded-2xl bg-blue-500 px-5 py-4 text-base font-semibold text-white transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:bg-slate-700"
              >
                {loading ? '생성 중...' : code ? '다시 코드 생성' : '페어링 코드 생성'}
              </button>

              {useRPPGMode && (
                <div className="mt-6">
                  <WebcamView />
                </div>
              )}
            </div>
          </section>

          <aside className="rounded-3xl border border-slate-800 bg-slate-950/90 p-6">
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-semibold text-white">연동 방법</h2>
                <p className="mt-2 text-sm leading-6 text-slate-400">아래 단계를 따라 아이폰 앱에 코드를 입력하세요.</p>
              </div>

              <div className="space-y-4 rounded-3xl bg-slate-900/90 p-5 text-sm text-slate-300">
                <div className="flex items-start gap-3">
                  <div className="mt-1 h-9 w-9 rounded-2xl bg-blue-500/20 text-center text-sm font-bold text-blue-300">1</div>
                  <div>
                    <p className="font-semibold text-white">페어링 코드 생성</p>
                    <p className="mt-1 text-slate-400">위 버튼으로 6자리 코드를 생성합니다.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="mt-1 h-9 w-9 rounded-2xl bg-blue-500/20 text-center text-sm font-bold text-blue-300">2</div>
                  <div>
                    <p className="font-semibold text-white">아이폰 앱에 입력</p>
                    <p className="mt-1 text-slate-400">생성된 6자리 코드를 아이폰 앱에 입력하세요.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="mt-1 h-9 w-9 rounded-2xl bg-blue-500/20 text-center text-sm font-bold text-blue-300">3</div>
                  <div>
                    <p className="font-semibold text-white">연결 확인</p>
                    <p className="mt-1 text-slate-400">입력 후 상태가 active로 바뀌면 연동이 완료됩니다.</p>
                  </div>
                </div>
              </div>

              {isWaiting && (
                <div className="rounded-3xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm text-emerald-200">
                  <p className="font-semibold text-emerald-100">대기 중...</p>
                  <p className="mt-1 text-slate-400">아이폰 앱에서 코드를 입력하면 자동으로 연결됩니다.</p>
                </div>
              )}

              {useAppleWatchMode && hasAppleWatchConnection && !hasAppleWatchValues && (
                <div className="rounded-3xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm text-emerald-100">
                  <p className="font-semibold text-emerald-200">Apple Watch 연결됨</p>
                  <p className="mt-1 text-slate-400">심박수와 집중 점수를 기다리는 중입니다.</p>
                </div>
              )}

              {useAppleWatchMode && hasAppleWatchValues && (
                <div className="rounded-3xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-100">
                  <p className="font-semibold text-emerald-200">Apple Watch 연결 완료!</p>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-xl bg-slate-950/70 px-2 py-3">
                      <p className="text-2xl font-black text-white">{displayedHeartRate || '--'}</p>
                      <p className="text-[10px] text-slate-400">bpm</p>
                    </div>
                    <div className="rounded-xl bg-slate-950/70 px-2 py-3">
                      <p className="text-2xl font-black text-emerald-200">{formatMetric(data?.focusScore)}</p>
                      <p className="text-[10px] text-slate-400">Score</p>
                    </div>
                    <div className="rounded-xl bg-slate-950/70 px-2 py-3">
                      <p className="text-2xl font-black text-cyan-200">{formatMetric(data?.focusThreshold)}</p>
                      <p className="text-[10px] text-slate-400">Threshold</p>
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-slate-400">집중 상태: {focusStatus}</p>
                </div>
              )}

              {useRPPGMode && (
                <div className="rounded-3xl border border-blue-500/20 bg-blue-500/10 p-4 text-sm text-blue-100">
                  <p className="font-semibold text-blue-200">rPPG 모드</p>
                  <p className="mt-2 text-3xl font-black text-white">{displayedHeartRate || '--'}</p>
                  <p className="text-slate-400">현재 심박수 (FacePhys 웹캠)</p>
                  <p className="mt-1 text-xs text-slate-500">{rppgStatus}{confidence != null ? ` · 신뢰도 ${Math.round(confidence * 100)}%` : ''}</p>
                </div>
              )}

              <MinuteHeartRateAverageBox averages={minuteHeartRateAverages} />
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
