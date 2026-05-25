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

interface SessionSummary {
  totalSeconds: number;
  avgFocus: number;
  avgBpm: number;
}

interface CalendarDay {
  key: string;
  day: number;
  isCurrentMonth: boolean;
}

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

const formatDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const dateFromKey = (dateKey: string) => {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day);
};

const formatSelectedDate = (dateKey: string) => (
  new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(dateFromKey(dateKey))
);

const formatMonthLabel = (date: Date) => (
  new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'long',
  }).format(date)
);

const getSessionSummary = (sessionList: StudySessionRecord[]): SessionSummary => {
  const totalSeconds = sessionList.reduce((sum, session) => sum + session.durationSeconds, 0);
  const avgFocus = sessionList.length
    ? Math.round(sessionList.reduce((sum, session) => sum + session.focusRatio, 0) / sessionList.length)
    : 0;
  const avgBpm = sessionList.length
    ? Math.round(sessionList.reduce((sum, session) => sum + session.avgBpm, 0) / sessionList.length)
    : 0;

  return { totalSeconds, avgFocus, avgBpm };
};

const getCalendarDays = (monthDate: Date): CalendarDay[] => {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const firstWeekday = firstDay.getDay();
  const startDate = new Date(year, month, 1 - firstWeekday);

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + index);

    return {
      key: formatDateKey(date),
      day: date.getDate(),
      isCurrentMonth: date.getMonth() === month,
    };
  });
};

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [sessions, setSessions] = useState<StudySessionRecord[]>([]);
  const [selectedDate, setSelectedDate] = useState(() => formatDateKey(new Date()));
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });

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

  const summary = useMemo(() => getSessionSummary(sessions), [sessions]);
  const sessionsByDate = useMemo(() => {
    const grouped = new Map<string, StudySessionRecord[]>();

    sessions.forEach((session) => {
      const key = formatDateKey(new Date(session.createdAt));
      const group = grouped.get(key) ?? [];
      group.push(session);
      grouped.set(key, group);
    });

    return grouped;
  }, [sessions]);
  const selectedSessions = sessionsByDate.get(selectedDate) ?? [];
  const selectedSummary = useMemo(() => getSessionSummary(selectedSessions), [selectedSessions]);
  const calendarDays = useMemo(() => getCalendarDays(calendarMonth), [calendarMonth]);
  const calendarSessionDates = useMemo(() => new Set(sessionsByDate.keys()), [sessionsByDate]);

  const recentSessions = sessions.slice(0, 6);
  const selectedMonthLabel = formatMonthLabel(calendarMonth);
  const todayKey = formatDateKey(new Date());

  const moveCalendarMonth = (offset: number) => {
    setCalendarMonth((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1));
  };

  const selectDate = (dateKey: string) => {
    const date = dateFromKey(dateKey);
    setSelectedDate(dateKey);
    setCalendarMonth(new Date(date.getFullYear(), date.getMonth(), 1));
  };

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
          <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="text-lg font-semibold">날짜별 통계</h2>
              <p className="mt-1 text-sm text-slate-500">달력에서 원하는 날짜를 선택하면 해당 날짜의 세션만 집계됩니다.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="date"
                value={selectedDate}
                onChange={(event) => selectDate(event.target.value)}
                className="h-10 rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-slate-200 outline-none transition [color-scheme:dark] hover:border-slate-500 focus:border-cyan-400"
              />
              <button
                onClick={() => selectDate(todayKey)}
                className="h-10 rounded-md border border-slate-700 px-4 text-sm font-semibold text-slate-200 transition hover:border-slate-500 hover:bg-slate-900"
              >
                오늘
              </button>
            </div>
          </div>

          <div className="grid gap-5 lg:grid-cols-[minmax(300px,380px)_1fr]">
            <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-4">
              <div className="mb-4 flex items-center justify-between">
                <button
                  onClick={() => moveCalendarMonth(-1)}
                  className="h-9 w-9 rounded-md border border-slate-800 text-lg text-slate-300 transition hover:border-slate-600 hover:bg-slate-900"
                  aria-label="이전 달"
                >
                  ‹
                </button>
                <p className="text-sm font-semibold text-slate-100">{selectedMonthLabel}</p>
                <button
                  onClick={() => moveCalendarMonth(1)}
                  className="h-9 w-9 rounded-md border border-slate-800 text-lg text-slate-300 transition hover:border-slate-600 hover:bg-slate-900"
                  aria-label="다음 달"
                >
                  ›
                </button>
              </div>

              <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-slate-500">
                {['일', '월', '화', '수', '목', '금', '토'].map((day) => (
                  <div key={day} className="py-2">
                    {day}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1">
                {calendarDays.map((day) => {
                  const hasSessions = calendarSessionDates.has(day.key);
                  const isSelected = day.key === selectedDate;
                  const isToday = day.key === todayKey;

                  return (
                    <button
                      key={day.key}
                      onClick={() => selectDate(day.key)}
                      className={`relative flex aspect-square min-h-10 items-center justify-center rounded-md text-sm transition ${
                        isSelected
                          ? 'bg-cyan-500 text-slate-950 shadow-[0_0_0_1px_rgba(34,211,238,0.55)]'
                          : day.isCurrentMonth
                            ? 'bg-slate-900 text-slate-200 hover:bg-slate-800'
                            : 'bg-slate-950/30 text-slate-600 hover:bg-slate-900/70'
                      }`}
                      aria-label={`${day.key} 통계 보기`}
                    >
                      <span>{day.day}</span>
                      {hasSessions && (
                        <span
                          className={`absolute bottom-1.5 h-1.5 w-1.5 rounded-full ${
                            isSelected ? 'bg-slate-950' : 'bg-emerald-300'
                          }`}
                        />
                      )}
                      {isToday && !isSelected && (
                        <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-cyan-300" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-5">
              <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-sm text-cyan-300">{formatSelectedDate(selectedDate)}</p>
                  <h3 className="mt-1 text-xl font-bold">선택 날짜 통계</h3>
                </div>
                <p className="text-sm text-slate-500">{selectedSessions.length}개 세션</p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-4">
                  <p className="text-xs text-slate-500">세션 수</p>
                  <p className="mt-2 text-2xl font-bold text-white">{selectedSessions.length}</p>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-4">
                  <p className="text-xs text-slate-500">학습 시간</p>
                  <p className="mt-2 text-2xl font-bold text-cyan-300">{formatDuration(selectedSummary.totalSeconds)}</p>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-4">
                  <p className="text-xs text-slate-500">평균 집중도</p>
                  <p className="mt-2 text-2xl font-bold text-emerald-300">{selectedSummary.avgFocus}%</p>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-4">
                  <p className="text-xs text-slate-500">평균 심박수</p>
                  <p className="mt-2 text-2xl font-bold text-rose-300">{selectedSummary.avgBpm || '--'} bpm</p>
                </div>
              </div>

              <div className="mt-5 overflow-hidden rounded-lg border border-slate-800">
                {selectedSessions.length > 0 ? (
                  <table className="w-full min-w-[520px] text-left text-sm">
                    <thead className="bg-slate-950 text-xs uppercase text-slate-500">
                      <tr>
                        <th className="px-4 py-3">일시</th>
                        <th className="px-4 py-3">학습 시간</th>
                        <th className="px-4 py-3">집중도</th>
                        <th className="px-4 py-3">평균 BPM</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {selectedSessions.map((session) => (
                        <tr key={session.id} className="bg-slate-900/60">
                          <td className="px-4 py-3 text-slate-300">{formatDate(session.createdAt)}</td>
                          <td className="px-4 py-3 text-slate-300">{formatDuration(session.durationSeconds)}</td>
                          <td className="px-4 py-3 font-semibold text-emerald-300">{session.focusRatio}%</td>
                          <td className="px-4 py-3 font-semibold text-rose-300">{session.avgBpm || '--'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="flex min-h-40 items-center justify-center bg-slate-900/60 px-4 text-center text-sm text-slate-500">
                    이 날짜에는 저장된 학습 세션이 없습니다.
                  </div>
                )}
              </div>
            </div>
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
