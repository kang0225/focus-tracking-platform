'use client';

import { useRouter } from 'next/navigation';
import WebcamView from '../components/WebcamView';
import GazeDashboard from '../components/GazeDashboard';
import { StatusCard } from '../components/StatusCard';
import { useConcentrationData } from '@/hooks/useConcentrationData';

export default function HomePage() {
  const router = useRouter();
  const { coordinates, isLoaded, heartRate, heartRateSource } = useConcentrationData();

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 text-white p-6">
      <div className="mx-auto max-w-7xl">
        {/* 헤더 섹션 */}
        <header className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">집중도 모니터링</h1>
            <p className="text-slate-400">실시간 데이터 트래킹</p>
          </div>
          <button onClick={() => router.push('/tracker')} className="rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 px-6 py-3 font-semibold shadow-lg shadow-blue-500/20 transition hover:shadow-lg hover:shadow-blue-400/40">⌚ Apple Watch 연동</button>
        </header>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* 메인 뷰어 */}
          <div className="lg:col-span-2">
            <div className="relative rounded-2xl bg-slate-900/70 p-6 shadow-2xl ring-1 ring-white/5">
              <WebcamView />
              {isLoaded && <GazeDashboard x={coordinates.x} y={coordinates.y} />}
              
              {/* Heart Rate Badge */}
              <div className="absolute top-6 right-6 rounded-xl bg-slate-950/90 px-4 py-3 ring-1 ring-slate-600/50">
                <p className="text-[10px] uppercase text-slate-400">{heartRateSource}</p>
                <p className="text-3xl font-bold text-red-400">{heartRate}</p>
              </div>
              <canvas id="heartbeatCanvas" className="hidden" />
            </div>
          </div>

          {/* 사이드바 */}
          <aside className="space-y-4">
            <StatusCard label="카메라" status="활성" isActive={true} colorClass="emerald" />
            <StatusCard label={`심박수 (${heartRateSource})`} status={heartRate > 0 ? "감지됨" : "대기 중"} isActive={heartRate > 0} colorClass="red" />
            <StatusCard label="시선 추적" status={isLoaded ? "로드됨" : "로드 중"} isActive={isLoaded} colorClass="blue" />
            
            <button onClick={() => router.push('/result')} className="w-full rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 px-6 py-3 font-semibold shadow-lg shadow-cyan-500/20 transition hover:shadow-lg hover:shadow-cyan-400/40">
              결과 보기
            </button>
          </aside>
        </div>
      </div>
    </main>
  );
}