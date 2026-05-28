'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';

interface AuthUser {
  id: string;
  name: string;
  avatarUrl: string | null;
}

interface SessionItem {
  id: string;
  startedAt: number;
  durationSeconds: number;
  focusRatio: number | null;
  avgBpm: number | null;
  rankingScore: number | null;
}

interface SessionStats {
  sessionCount: number;
  totalDurationSeconds: number;
  avgBpm: number | null;
  avgFocusRatio: number | null;
}

interface CalendarDay {
  key: string;
  day: number;
  isCurrentMonth: boolean;
}

const formatDuration = (seconds: number) => {
  if (!seconds || seconds < 0) return '0분';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}시간 ${m}분`;
  return `${m}분`;
};

const formatDateTime = (ts: number) =>
  new Intl.DateTimeFormat('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    .format(new Date(ts));

const formatDateKey = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const dateFromKey = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
};

const formatSelectedDate = (key: string) =>
  new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })
    .format(dateFromKey(key));

const formatMonth = (date: Date) =>
  new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long' }).format(date);

const buildCalendar = (month: Date): CalendarDay[] => {
  const y = month.getFullYear();
  const m = month.getMonth();
  const first = new Date(y, m, 1);
  const firstWeekday = first.getDay();
  const start = new Date(y, m, 1 - firstWeekday);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return { key: formatDateKey(d), day: d.getDate(), isCurrentMonth: d.getMonth() === m };
  });
};

const aggregate = (list: SessionItem[]): SessionStats => {
  const total = list.reduce((s, x) => s + x.durationSeconds, 0);
  const focusList = list.map((x) => x.focusRatio).filter((v): v is number => v != null);
  const bpmList = list.map((x) => x.avgBpm).filter((v): v is number => v != null && v > 0);
  return {
    sessionCount: list.length,
    totalDurationSeconds: total,
    avgFocusRatio: focusList.length ? focusList.reduce((a, b) => a + b, 0) / focusList.length : null,
    avgBpm: bpmList.length ? bpmList.reduce((a, b) => a + b, 0) / bpmList.length : null,
  };
};

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [stats, setStats] = useState<SessionStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(() => formatDateKey(new Date()));
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const t = new Date();
    return new Date(t.getFullYear(), t.getMonth(), 1);
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const meRes = await fetch('/api/auth/me');
        if (!meRes.ok) {
          router.replace('/login?next=/dashboard');
          return;
        }
        const meData = await meRes.json();
        if (cancelled) return;
        setUser(meData.user);

        const res = await fetch('/api/tracking/sessions?limit=200');
        if (cancelled) return;
        if (res.ok) {
          const data = await res.json();
          setSessions(data.sessions ?? []);
          setStats(data.stats ?? null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [router]);

  const sessionsByDate = useMemo(() => {
    const m = new Map<string, SessionItem[]>();
    sessions.forEach((s) => {
      const key = formatDateKey(new Date(s.startedAt));
      const group = m.get(key) ?? [];
      group.push(s);
      m.set(key, group);
    });
    return m;
  }, [sessions]);

  const selectedSessions = sessionsByDate.get(selectedDate) ?? [];
  const selectedStats = useMemo(() => aggregate(selectedSessions), [selectedSessions]);
  const calendarDays = useMemo(() => buildCalendar(calendarMonth), [calendarMonth]);
  const calendarSessionDates = useMemo(() => new Set(sessionsByDate.keys()), [sessionsByDate]);
  const recentSessions = sessions.slice(0, 10);
  const todayKey = formatDateKey(new Date());

  const moveMonth = (offset: number) => {
    setCalendarMonth((c) => new Date(c.getFullYear(), c.getMonth() + offset, 1));
  };

  const selectDate = (key: string) => {
    const d = dateFromKey(key);
    setSelectedDate(key);
    setCalendarMonth(new Date(d.getFullYear(), d.getMonth(), 1));
  };

  if (loading || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center" style={{ background: 'var(--color-bg-soft)' }}>
        <div className="flex items-center gap-2" style={{ color: 'var(--color-brand-600)' }}>
          <i className="ti ti-loader-2 animate-spin text-xl" aria-hidden="true" />
          <span className="text-sm">불러오는 중...</span>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen" style={{ background: 'var(--color-bg-soft)' }}>
      <Navbar user={user} />

      <div className="mx-auto max-w-7xl px-6 py-8 lg:px-10 lg:py-10">
        {/* 헤더 */}
        <section className="mb-6">
          <div className="text-sm font-semibold" style={{ color: 'var(--color-brand-600)' }}>대시보드</div>
          <h1 className="mt-1 text-3xl font-semibold" style={{ color: 'var(--color-brand-900)', letterSpacing: '-0.02em' }}>
            {user.name}님의 학습 기록
          </h1>
        </section>

        {/* 누적 통계 3 카드 */}
        <section className="mb-6 grid gap-4 md:grid-cols-3">
          <StatCard label="누적 학습 시간" value={stats ? formatDuration(stats.totalDurationSeconds) : '0분'} icon="ti-clock" />
          <StatCard
            label="평균 집중도"
            value={stats?.avgFocusRatio != null ? `${Math.round(stats.avgFocusRatio * 100)}%` : '--'}
            icon="ti-bolt"
          />
          <StatCard
            label="평균 심박수"
            value={stats?.avgBpm != null ? `${Math.round(stats.avgBpm)} bpm` : '-- bpm'}
            icon="ti-heart"
          />
        </section>

        {/* 날짜별 통계 (캘린더 + 선택 날짜) */}
        <section className="ft-card mb-6">
          <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="text-base font-semibold" style={{ color: 'var(--color-brand-900)' }}>날짜별 통계</div>
              <div className="mt-1 text-xs" style={{ color: 'var(--color-text-soft)' }}>
                달력에서 원하는 날짜를 선택하면 해당 날짜의 세션만 집계됩니다.
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => selectDate(e.target.value)}
                className="ft-input h-9 px-2 text-sm"
                style={{ width: 'auto' }}
              />
              <button onClick={() => selectDate(todayKey)} className="ft-btn-secondary text-xs">오늘</button>
            </div>
          </div>

          <div className="grid gap-5 lg:grid-cols-[minmax(280px,360px)_1fr]">
            {/* 캘린더 */}
            <div className="rounded-xl p-4" style={{ background: 'var(--color-bg-soft)', border: '1px solid var(--color-border)' }}>
              <div className="mb-3 flex items-center justify-between">
                <button
                  onClick={() => moveMonth(-1)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors"
                  style={{ color: 'var(--color-text-soft)' }}
                  aria-label="이전 달"
                >
                  <i className="ti ti-chevron-left text-base" aria-hidden="true" />
                </button>
                <div className="text-sm font-semibold" style={{ color: 'var(--color-brand-900)' }}>
                  {formatMonth(calendarMonth)}
                </div>
                <button
                  onClick={() => moveMonth(1)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors"
                  style={{ color: 'var(--color-text-soft)' }}
                  aria-label="다음 달"
                >
                  <i className="ti ti-chevron-right text-base" aria-hidden="true" />
                </button>
              </div>

              <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold" style={{ color: 'var(--color-text-muted)' }}>
                {['일', '월', '화', '수', '목', '금', '토'].map((d) => (
                  <div key={d} className="py-1.5">{d}</div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1">
                {calendarDays.map((day) => {
                  const has = calendarSessionDates.has(day.key);
                  const isSel = day.key === selectedDate;
                  const isToday = day.key === todayKey;

                  return (
                    <button
                      key={day.key}
                      onClick={() => selectDate(day.key)}
                      className="relative flex aspect-square items-center justify-center rounded-lg text-xs transition-colors"
                      style={{
                        background: isSel ? 'var(--color-brand-500)' : day.isCurrentMonth ? 'white' : 'transparent',
                        color: isSel ? 'white' : day.isCurrentMonth ? 'var(--color-brand-900)' : 'var(--color-text-muted)',
                        fontWeight: isSel ? 600 : 500,
                        boxShadow: isSel ? 'var(--shadow-brand)' : 'none',
                      }}
                    >
                      <span>{day.day}</span>
                      {has && (
                        <span
                          className="absolute bottom-1 h-1 w-1 rounded-full"
                          style={{ background: isSel ? 'white' : 'var(--color-success)' }}
                        />
                      )}
                      {isToday && !isSel && (
                        <span
                          className="absolute right-1 top-1 h-1 w-1 rounded-full"
                          style={{ background: 'var(--color-brand-500)' }}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 선택 날짜 통계 */}
            <div className="rounded-xl p-5" style={{ background: 'var(--color-bg-soft)', border: '1px solid var(--color-border)' }}>
              <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <div className="text-xs font-semibold" style={{ color: 'var(--color-brand-600)' }}>{formatSelectedDate(selectedDate)}</div>
                  <h3 className="mt-0.5 text-lg font-semibold" style={{ color: 'var(--color-brand-900)' }}>선택 날짜 통계</h3>
                </div>
                <div className="text-xs" style={{ color: 'var(--color-text-soft)' }}>
                  {selectedSessions.length}개 세션
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <MiniStat label="세션 수" value={String(selectedSessions.length)} />
                <MiniStat label="학습 시간" value={formatDuration(selectedStats.totalDurationSeconds)} accent />
                <MiniStat label="평균 집중도" value={selectedStats.avgFocusRatio != null ? `${Math.round(selectedStats.avgFocusRatio * 100)}%` : '--'} />
                <MiniStat label="평균 BPM" value={selectedStats.avgBpm != null ? String(Math.round(selectedStats.avgBpm)) : '--'} />
              </div>

              <div className="mt-5 overflow-hidden rounded-xl" style={{ background: 'white', border: '1px solid var(--color-border)' }}>
                {selectedSessions.length > 0 ? (
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr style={{ background: 'var(--color-brand-50)' }}>
                        <th className="px-3 py-2.5 text-xs font-semibold" style={{ color: 'var(--color-text-soft)' }}>일시</th>
                        <th className="px-3 py-2.5 text-xs font-semibold" style={{ color: 'var(--color-text-soft)' }}>학습 시간</th>
                        <th className="px-3 py-2.5 text-xs font-semibold" style={{ color: 'var(--color-text-soft)' }}>집중도</th>
                        <th className="px-3 py-2.5 text-xs font-semibold" style={{ color: 'var(--color-text-soft)' }}>BPM</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedSessions.map((s) => (
                        <tr key={s.id} className="border-t" style={{ borderColor: 'var(--color-border)' }}>
                          <td className="px-3 py-2.5" style={{ color: 'var(--color-text)' }}>{formatDateTime(s.startedAt)}</td>
                          <td className="px-3 py-2.5" style={{ color: 'var(--color-text-soft)' }}>{formatDuration(s.durationSeconds)}</td>
                          <td className="px-3 py-2.5 font-semibold" style={{ color: 'var(--color-brand-600)' }}>
                            {s.focusRatio != null ? `${Math.round(s.focusRatio * 100)}%` : '--'}
                          </td>
                          <td className="px-3 py-2.5 font-semibold" style={{ color: 'var(--color-danger)' }}>
                            {s.avgBpm != null ? Math.round(s.avgBpm) : '--'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="flex flex-col items-center justify-center py-10 text-center">
                    <i className="ti ti-mood-empty text-3xl" aria-hidden="true" style={{ color: 'var(--color-text-muted)' }} />
                    <p className="mt-2 text-sm" style={{ color: 'var(--color-text-muted)' }}>
                      이 날짜에는 저장된 학습 세션이 없습니다.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* 최근 세션 */}
        <section className="ft-card">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="text-base font-semibold" style={{ color: 'var(--color-brand-900)' }}>최근 세션</div>
              <div className="mt-0.5 text-xs" style={{ color: 'var(--color-text-soft)' }}>최근 10개 세션 기록</div>
            </div>
          </div>

          {recentSessions.length > 0 ? (
            <div className="overflow-hidden rounded-xl" style={{ border: '1px solid var(--color-border)' }}>
              <table className="w-full text-left text-sm">
                <thead>
                  <tr style={{ background: 'var(--color-brand-50)' }}>
                    <th className="px-3 py-2.5 text-xs font-semibold" style={{ color: 'var(--color-text-soft)' }}>일시</th>
                    <th className="px-3 py-2.5 text-xs font-semibold" style={{ color: 'var(--color-text-soft)' }}>학습 시간</th>
                    <th className="px-3 py-2.5 text-xs font-semibold" style={{ color: 'var(--color-text-soft)' }}>집중도</th>
                    <th className="px-3 py-2.5 text-xs font-semibold" style={{ color: 'var(--color-text-soft)' }}>BPM</th>
                  </tr>
                </thead>
                <tbody>
                  {recentSessions.map((s) => (
                    <tr key={s.id} className="border-t" style={{ borderColor: 'var(--color-border)' }}>
                      <td className="px-3 py-2.5" style={{ color: 'var(--color-text)' }}>{formatDateTime(s.startedAt)}</td>
                      <td className="px-3 py-2.5" style={{ color: 'var(--color-text-soft)' }}>{formatDuration(s.durationSeconds)}</td>
                      <td className="px-3 py-2.5 font-semibold" style={{ color: 'var(--color-brand-600)' }}>
                        {s.focusRatio != null ? `${Math.round(s.focusRatio * 100)}%` : '--'}
                      </td>
                      <td className="px-3 py-2.5 font-semibold" style={{ color: 'var(--color-danger)' }}>
                        {s.avgBpm != null ? Math.round(s.avgBpm) : '--'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <i className="ti ti-mood-smile text-3xl" aria-hidden="true" style={{ color: 'var(--color-brand-400)' }} />
              <p className="mt-2 text-sm font-semibold" style={{ color: 'var(--color-brand-900)' }}>아직 저장된 학습 세션이 없습니다</p>
              <p className="mt-1 text-xs" style={{ color: 'var(--color-text-soft)' }}>측정을 진행하면 여기에 기록이 쌓입니다</p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function StatCard({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <div className="ft-card">
      <div className="flex items-center justify-between">
        <div className="text-sm" style={{ color: 'var(--color-text-soft)' }}>{label}</div>
        <div
          className="flex h-9 w-9 items-center justify-center rounded-lg"
          style={{ background: 'var(--color-brand-50)', color: 'var(--color-brand-600)' }}
        >
          <i className={`ti ${icon} text-base`} aria-hidden="true" />
        </div>
      </div>
      <div className="mt-2 text-2xl font-semibold" style={{ color: 'var(--color-brand-900)' }}>{value}</div>
    </div>
  );
}

function MiniStat({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-lg px-3 py-2.5" style={{ background: 'white', border: '1px solid var(--color-border)' }}>
      <div className="text-[10px] font-semibold uppercase" style={{ color: 'var(--color-text-soft)' }}>{label}</div>
      <div
        className="mt-1 text-lg font-semibold"
        style={{ color: accent ? 'var(--color-brand-600)' : 'var(--color-brand-900)' }}
      >
        {value}
      </div>
    </div>
  );
}
