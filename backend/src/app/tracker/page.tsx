'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import WebcamView from '@/components/WebcamView';
import { MinuteHeartRateAverageBox } from '@/components/MinuteHeartRateAverageBox';
import { isRppgMeasuringStatus, useRPPG } from '@/hooks/useRPPG';
import { useMinuteHeartRateAverages } from '@/hooks/useMinuteHeartRateAverages';
import { useRollingHeartRateAverage } from '@/hooks/useRollingHeartRateAverage';
import type { PairingData, PairingResponse } from '@/types/tracker';

export default function TrackerPage() {
  const router = useRouter();
  const [code, setCode] = useState<string>('');
  const [data, setData] = useState<PairingData | null>(null);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('페어링 버튼을 눌러 6자리 코드를 생성하세요.');

  const isPaired = !!data && data.status === 'active';
  const hasAppleWatchValues = isPaired && (data?.heartRate ?? 0) > 0;
  const hasAppleWatchConnection = isPaired && (data?.appleWatchPaired === true || hasAppleWatchValues);

  const { bpm, status: rppgStatus } = useRPPG('webgazerVideoFeed', true);
  const displayedHeartRate = useRollingHeartRateAverage(bpm, bpm > 0, 10, 'FacePhys Camera');
  const isRppgMeasuring = isRppgMeasuringStatus(rppgStatus);
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
        const res = await fetch(`/api/pair/current`);
        if (!res.ok) return;
        const json = await res.json();
        if (json && (json.status === 'active' || json.active !== false)) {
          setData(json);
        }
      } catch (err) {
        console.error('상태 확인 실패:', err);
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [code]);

  const isWaiting = !!code && (!data || data.status === 'waiting');

  return (
    <main className="min-h-screen" style={{ background: 'var(--color-bg)' }}>
      <Navbar />

      <div className="mx-auto max-w-5xl px-6 py-6">
        <div className="mb-5">
          <button
            onClick={() => router.back()}
            className="ft-btn-ghost mb-3 inline-flex items-center gap-1 text-xs"
          >
            <i className="ti ti-arrow-left text-xs" aria-hidden="true" />
            뒤로
          </button>
          <div className="text-xs font-medium" style={{ color: 'var(--color-brand-600)' }}>Apple Watch 페어링</div>
          <h1 className="mt-0.5 text-2xl font-medium" style={{ color: 'var(--color-brand-900)' }}>
            iPhone 앱과 연결하기
          </h1>
          <p className="mt-1.5 text-sm" style={{ color: 'var(--color-text-soft)' }}>
            Apple Watch를 연결해도 화면에서는 웹캠 심박 측정을 계속 보여줍니다.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.3fr_0.9fr]">
          <section className="ft-card space-y-4">
            <div className="ft-card-soft">
              <p className="text-xs" style={{ color: 'var(--color-text-soft)' }}>현재 상태</p>
              <p className="mt-1.5 text-base font-medium" style={{ color: 'var(--color-brand-900)' }}>{statusMessage}</p>
            </div>

            <div className="rounded-xl p-5 text-center" style={{ background: 'var(--color-brand-50)' }}>
              <p className="text-xs uppercase tracking-widest" style={{ color: 'var(--color-brand-600)' }}>Pairing Code</p>
              <div className="mt-4 flex items-center justify-center rounded-xl bg-white px-5 py-5 text-4xl font-medium tracking-[0.3em]" style={{ color: 'var(--color-brand-600)', border: '1px solid var(--color-brand-200)' }}>
                {code || '------'}
              </div>
              <p className="mt-3 text-xs" style={{ color: 'var(--color-text-soft)' }}>
                아이폰 앱에서 위 코드를 입력하면 페어링이 시작됩니다.
              </p>
            </div>

            <button
              type="button"
              onClick={generateCode}
              disabled={loading}
              className="w-full rounded-xl px-5 py-3 text-sm font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-60"
              style={{ background: 'var(--color-brand-500)' }}
            >
              {loading ? '생성 중...' : code ? '다시 코드 생성' : '페어링 코드 생성'}
            </button>

            <div className="overflow-hidden rounded-xl" style={{ border: '1px solid var(--color-border)' }}>
              <WebcamView />
            </div>
          </section>

          <aside className="space-y-3">
            <div className="ft-card">
              <h2 className="text-base font-medium" style={{ color: 'var(--color-brand-900)' }}>연동 방법</h2>
              <div className="mt-3 space-y-3 text-sm" style={{ color: 'var(--color-text)' }}>
                {[
                  { n: 1, t: '페어링 코드 생성', d: '왼쪽 버튼으로 6자리 코드를 만듭니다.' },
                  { n: 2, t: '아이폰 앱에 입력', d: '코드를 iPhone 앱에 입력하세요.' },
                  { n: 3, t: '연결 확인', d: '입력 후 active 상태로 바뀌면 완료.' },
                ].map((s) => (
                  <div key={s.n} className="flex items-start gap-2.5">
                    <div className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium"
                         style={{ background: 'var(--color-brand-100)', color: 'var(--color-brand-700)' }}>
                      {s.n}
                    </div>
                    <div>
                      <p className="text-sm font-medium" style={{ color: 'var(--color-brand-900)' }}>{s.t}</p>
                      <p className="mt-0.5 text-xs" style={{ color: 'var(--color-text-soft)' }}>{s.d}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {isWaiting && (
              <div className="ft-card" style={{ background: 'var(--color-brand-50)', borderColor: 'var(--color-brand-200)' }}>
                <p className="text-sm font-medium" style={{ color: 'var(--color-brand-700)' }}>대기 중...</p>
                <p className="mt-1 text-xs" style={{ color: 'var(--color-text-soft)' }}>
                  아이폰 앱에서 코드를 입력하면 자동으로 연결됩니다.
                </p>
              </div>
            )}

            {hasAppleWatchConnection && (
              <div className="ft-card" style={{ background: 'var(--color-brand-50)', borderColor: 'var(--color-brand-200)' }}>
                <p className="text-sm font-medium" style={{ color: 'var(--color-brand-700)' }}>Apple Watch 연결됨</p>
                <p className="mt-1 text-xs" style={{ color: 'var(--color-text-soft)' }}>
                  {hasAppleWatchValues ? '심박 수신 중입니다.' : '심박 수신을 기다리는 중입니다.'}
                </p>
              </div>
            )}

            <div className="ft-card">
              <p className="text-sm font-medium" style={{ color: 'var(--color-brand-700)' }}>심박수</p>
              <p className="mt-2 text-3xl font-medium" style={{ color: 'var(--color-brand-900)' }}>{displayedHeartRate || '--'}</p>
              <p className="text-xs" style={{ color: 'var(--color-text-soft)' }}>현재 측정값</p>
              <p className="mt-1 text-[11px]" style={{ color: 'var(--color-text-muted)' }}>{rppgStatus}</p>
            </div>

            <MinuteHeartRateAverageBox averages={minuteHeartRateAverages} />
          </aside>
        </div>
      </div>
    </main>
  );
}
