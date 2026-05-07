'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { StudySessionRecord } from '@/types/dashboard';

interface AuthUser {
  id: string;
  login: string;
  name: string;
  avatarUrl: string;
  email: string | null;
}

const STORAGE_KEY = 'focusTracker.sessions';

const formatDuration = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}분 ${rest}초`;
};

const formatDate = (timestamp: number) => (
  new Intl.DateTimeFormat('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp))
);

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [sessions, setSessions] = useState<StudySessionRecord[]>([]);

  useEffect(() => {
    const loadUser = async () => {
      const res = await fetch('/api/auth/me');
      if (!res.ok) {
        router.replace('/login');
        return;
      }

      const data: { user: AuthUser } = await res.json();
      setUser(data.user);
    };

    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setSessions(JSON.parse(stored));
      } catch {
        setSessions([]);
      }
    }

    void loadUser();
  }, [router]);

  const summary = useMemo(() => {
    const totalSeconds = sessions.reduce((sum, session) => sum + session.durationSeconds, 0);
    const avgFocus = sessions.length
      ? Math.round(sessions.reduce((sum, session) => sum + session.focusRatio, 0) / sessions.length)
      : 0;
    const avgBpm = sessions.length
      ? Math.round(sessions.reduce((sum, session) => sum + session.avgBpm, 0) / sessions.length)
      : 0;

    return { totalSeconds, avgFocus, avgBpm };
  }, [sessions]);

  const recentSessions = sessions.slice(0, 6);

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-6 text-white sm:px-6">
      <div className="mx-auto w-full max-w-7xl">
        <header className="mb-6 flex flex-col gap-4 border-b border-slate-800 pb-5 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            {user?.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt=""
                className="h-12 w-12 rounded-md border border-slate-700"
              />
            ) : (
              <div className="h-12 w-12 rounded-md bg-slate-800" />
            )}
            <div>
              <p className="text-sm text-cyan-300">대시보드</p>
              <h1 className="text-2xl font-bold">{user ? `${user.name}님의 학습 기록` : '학습 기록'}</h1>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => router.push('/')}
              className="h-10 rounded-md border border-slate-700 px-4 text-sm font-semibold text-slate-200 transition hover:border-slate-500 hover:bg-slate-900"
            >
              실시간 측정
            </button>
            <button
              onClick={() => router.push('/room')}
              className="h-10 rounded-md bg-cyan-600 px-4 text-sm font-semibold transition hover:bg-cyan-500"
            >
              화상 집중방
            </button>
            <form action="/api/auth/logout" method="post">
              <button className="h-10 rounded-md border border-rose-500/50 px-4 text-sm font-semibold text-rose-100 transition hover:bg-rose-500/10">
                로그아웃
              </button>
            </form>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-lg border border-slate-800 bg-slate-900/80 p-5">
            <p className="text-sm text-slate-400">누적 학습 시간</p>
            <p className="mt-3 text-3xl font-bold text-cyan-300">{formatDuration(summary.totalSeconds)}</p>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-900/80 p-5">
            <p className="text-sm text-slate-400">평균 집중도</p>
            <p className="mt-3 text-3xl font-bold text-emerald-300">{summary.avgFocus}%</p>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-900/80 p-5">
            <p className="text-sm text-slate-400">평균 심박수</p>
            <p className="mt-3 text-3xl font-bold text-rose-300">{summary.avgBpm || '--'} bpm</p>
          </div>
        </section>

        <section className="mt-6 rounded-lg border border-slate-800 bg-slate-900/70 p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">최근 세션</h2>
              <p className="mt-1 text-sm text-slate-500">결과 페이지를 열면 세션 기록이 이 브라우저에 저장됩니다.</p>
            </div>
          </div>

          {recentSessions.length > 0 ? (
            <div className="overflow-hidden rounded-lg border border-slate-800">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="bg-slate-950 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">일시</th>
                    <th className="px-4 py-3">학습 시간</th>
                    <th className="px-4 py-3">집중도</th>
                    <th className="px-4 py-3">평균 BPM</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {recentSessions.map((session) => (
                    <tr key={session.id} className="bg-slate-900/60">
                      <td className="px-4 py-3 text-slate-300">{formatDate(session.createdAt)}</td>
                      <td className="px-4 py-3 text-slate-300">{formatDuration(session.durationSeconds)}</td>
                      <td className="px-4 py-3 font-semibold text-emerald-300">{session.focusRatio}%</td>
                      <td className="px-4 py-3 font-semibold text-rose-300">{session.avgBpm || '--'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex min-h-52 items-center justify-center rounded-lg border border-dashed border-slate-700 text-center text-sm text-slate-500">
              아직 저장된 학습 세션이 없습니다.
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
