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

interface StatsResp {
  stats: { sessionCount: number; totalDurationSeconds: number; avgBpm: number | null; avgFocusRatio: number | null } | null;
  sessions: SessionItem[];
}

interface LeaderboardEntry {
  rank: number;
  userId: string;
  displayName: string;
  rankingScore: number;
  highFocusSeconds: number;
  validSeconds: number;
  focusRatio: number;
}

type RankCategory = 'score' | 'time' | 'focus';
type RankRange = 'day' | 'week' | 'month';

interface UserSettings {
  dailyGoalHours: number;
  ddayDate: string | null;     // "YYYY-MM-DD" 또는 null
  ddayLabel: string | null;
  dailyMotto: string | null;
}

const DEFAULT_SETTINGS: UserSettings = {
  dailyGoalHours: 4,
  ddayDate: null,
  ddayLabel: null,
  dailyMotto: null,
};

const CATEGORIES: { key: RankCategory; label: string; icon: string }[] = [
  { key: 'score', label: '점수왕', icon: 'ti-trophy' },
  { key: 'time', label: '엉덩이왕', icon: 'ti-armchair' },
  { key: 'focus', label: '몰입왕', icon: 'ti-bolt' },
];

const RANGES: { key: RankRange; label: string }[] = [
  { key: 'day', label: '오늘' },
  { key: 'week', label: '이번 주' },
  { key: 'month', label: '이번 달' },
];

const formatDuration = (seconds: number) => {
  if (!seconds || seconds < 0) return '0분';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}시간 ${m}분`;
  return `${m}분`;
};

const formatTime = (seconds: number) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${String(m).padStart(2, '0')}m`;
};

const normalizeFocusRatio = (value: number) => {
  const ratio = value > 1 ? value / 100 : value;
  return Math.max(0, Math.min(1, ratio));
};

const formatFocusPercent = (value: number | null | undefined) => {
  if (value == null || !Number.isFinite(value)) return '--';
  return `${Math.round(normalizeFocusRatio(value) * 100)}%`;
};

const formatRelativeDate = (timestamp: number) => {
  const date = new Date(timestamp);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();
  const prefix = isToday ? '오늘' : isYesterday ? '어제' : `${date.getMonth() + 1}월 ${date.getDate()}일`;
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${prefix} ${hh}:${mm}`;
};

const todayDateStr = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const dDay = (target: Date) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  return diff;
};

const autoComment = (entry: LeaderboardEntry): string => {
  const focusRatio = normalizeFocusRatio(entry.focusRatio);
  if (focusRatio >= 0.85) return '몰입의 신';
  if (entry.validSeconds >= 4 * 3600) return '엉덩이 챔피언';
  if (focusRatio >= 0.75) return '오늘도 화이팅';
  if (entry.validSeconds >= 2 * 3600) return '꾸준한 그대';
  return '시간만 늘리면 탑 5';
};

export default function HomePage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [data, setData] = useState<StatsResp | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [myRank, setMyRank] = useState<{ rank: number; total: number; rankingScore: number; highFocusSeconds: number; validSeconds: number } | null>(null);
  const [activeCategory, setActiveCategory] = useState<RankCategory>('score');
  const [activeRange, setActiveRange] = useState<RankRange>('day');
  const [inviteCodeInput, setInviteCodeInput] = useState('');
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [editingField, setEditingField] = useState<null | 'goal' | 'dday' | 'motto'>(null);

  // DB 에서 설정 로드 — 사용자 로그인 후
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/me/settings');
        if (res.ok) {
          const data = await res.json();
          if (!cancelled && data?.settings) setSettings(data.settings as UserSettings);
        }
      } catch (e) {
        console.error('settings load failed:', e);
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  /**
   * 설정을 DB 에 PATCH 로 저장 + 로컬 state 즉시 갱신 (optimistic).
   * 네트워크 실패해도 UI 는 안 깨짐 — 다음 새로고침 때 DB 값으로 복원.
   */
  const updateSettings = async (patch: Partial<UserSettings>) => {
    setSettings((cur) => ({ ...cur, ...patch }));
    if (!user) return;
    try {
      await fetch('/api/me/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
    } catch (e) {
      console.error('settings save failed:', e);
    }
  };

  /**
   * 편집 버튼 핸들러 — 비로그인 시 로그인 페이지로 redirect.
   */
  const tryEdit = (field: 'goal' | 'dday' | 'motto') => {
    if (!user) {
      router.push('/login?next=/');
      return;
    }
    setEditingField(editingField === field ? null : field);
  };

  // 사용자 + 본인 세션 데이터 (1회 fetch)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const meRes = await fetch('/api/auth/me');
        const meData = meRes.ok ? await meRes.json() : null;
        if (cancelled) return;
        const loggedInUser = meData?.user ?? null;
        setUser(loggedInUser);

        if (loggedInUser) {
          const sessionsRes = await fetch('/api/tracking/sessions?limit=10').then(r => r.ok ? r.json() : null);
          if (cancelled) return;
          if (sessionsRes) setData(sessionsRes as StatsResp);
        }
      } catch (e) {
        console.error('home fetch failed:', e);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // 랭킹 — range 가 바뀔 때마다 다시 fetch
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const today = todayDateStr();
        const [leaderboardRes, meRankRes] = await Promise.all([
          fetch(`/api/ranking?date=${today}&range=${activeRange}&limit=20`).then(r => r.ok ? r.json() : null),
          user
            ? fetch(`/api/ranking/me?date=${today}&range=${activeRange}`).then(r => r.ok ? r.json() : null)
            : Promise.resolve(null),
        ]);
        if (cancelled) return;
        setLeaderboard((leaderboardRes?.entries as LeaderboardEntry[]) ?? []);
        setMyRank(user && meRankRes ? (meRankRes as { rank?: typeof myRank }).rank ?? null : null);
      } catch (e) {
        console.error('leaderboard fetch failed:', e);
      }
    })();
    return () => { cancelled = true; };
  }, [activeRange, user]);

  const requireAuth = (next: string) => {
    if (!user) {
      router.push(`/login?next=${encodeURIComponent(next)}`);
      return false;
    }
    return true;
  };

  const enterRandomRoom = () => {
    if (requireAuth('/room?mode=public')) router.push('/room?mode=public');
  };
  const createInviteRoom = () => {
    if (requireAuth('/room?mode=invite-create')) router.push('/room?mode=invite-create');
  };
  const joinInviteRoom = () => {
    const code = inviteCodeInput.trim();
    if (!code) return;
    const url = `/room?mode=invite-join&code=${encodeURIComponent(code)}`;
    if (requireAuth(url)) router.push(url);
  };
  const goMeasure = () => {
    if (requireAuth('/measure')) router.push('/measure');
  };

  const sortedLeaderboard = useMemo(() => {
    const arr = [...leaderboard];
    if (activeCategory === 'time') arr.sort((a, b) => b.validSeconds - a.validSeconds);
    else if (activeCategory === 'focus') arr.sort((a, b) => b.focusRatio - a.focusRatio);
    return arr.slice(0, 5);
  }, [leaderboard, activeCategory]);

  const todayValidSeconds = useMemo(() => {
    if (!data?.sessions) return 0;
    const today = new Date().toDateString();
    return data.sessions
      .filter((s) => new Date(s.startedAt).toDateString() === today)
      .reduce((sum, s) => sum + s.durationSeconds, 0);
  }, [data]);

  const dailyGoalSeconds = Math.max(1, settings.dailyGoalHours) * 3600;
  const progressPct = Math.min(100, Math.round((todayValidSeconds / dailyGoalSeconds) * 100));
  const remainingSeconds = Math.max(0, dailyGoalSeconds - todayValidSeconds);
  const ddayLeft = settings.ddayDate ? dDay(new Date(settings.ddayDate)) : null;

  const welcomeName = user?.name ?? '게스트';
  const welcomeMessage = user ? '오늘도 화이팅하세요' : '로그인하면 학습 기록이 시작됩니다';

  return (
    <main className="min-h-screen" style={{ background: 'var(--color-bg-soft)' }}>
      <Navbar user={user} showSignIn />

      <div className="mx-auto max-w-7xl px-6 py-8 lg:px-10 lg:py-10">
        {/* 환영 헤더 */}
        <section className="mb-6">
          <div className="text-sm font-semibold" style={{ color: 'var(--color-brand-600)' }}>안녕하세요</div>
          <h1 className="mt-1 text-3xl font-semibold" style={{ color: 'var(--color-brand-900)', letterSpacing: '-0.02em' }}>
            {welcomeName}님, {welcomeMessage}
          </h1>
        </section>

        {/* 상단 — 오늘 목표 / D-DAY / 측정 CTA */}
        <section className="mb-6 grid gap-4 lg:grid-cols-[1.4fr_1fr_1.2fr]">
          {/* 오늘 목표 카드 (편집 가능) */}
          <div className="ft-card">
            <div className="flex items-center justify-between">
              <div className="text-sm" style={{ color: 'var(--color-text-soft)' }}>오늘 목표</div>
              <div className="flex items-center gap-2">
                {user && <span className="text-xs font-semibold" style={{ color: 'var(--color-brand-500)' }}>{progressPct}%</span>}
                <button
                  type="button"
                  onClick={() => tryEdit('goal')}
                  className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-blue-50"
                  style={{ color: 'var(--color-brand-500)' }}
                  aria-label="목표 설정"
                >
                  <i className="ti ti-pencil text-lg" aria-hidden="true" />
                </button>
              </div>
            </div>
            {editingField === 'goal' ? (
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={24}
                  step="0.5"
                  value={settings.dailyGoalHours}
                  onChange={(e) => updateSettings({ dailyGoalHours: Math.max(1, Number(e.target.value) || 1) })}
                  className="ft-input w-20 px-2 py-1 text-base font-semibold"
                  style={{ color: 'var(--color-brand-900)' }}
                  autoFocus
                  onBlur={() => setEditingField(null)}
                  onKeyDown={(e) => { if (e.key === 'Enter') setEditingField(null); }}
                />
                <span className="text-sm" style={{ color: 'var(--color-text-soft)' }}>시간</span>
              </div>
            ) : (
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-3xl font-semibold" style={{ color: 'var(--color-brand-900)' }}>
                  {user ? formatDuration(todayValidSeconds) : '0분'}
                </span>
                <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>/ {settings.dailyGoalHours}시간</span>
              </div>
            )}
            <div className="mt-3 h-2 overflow-hidden rounded-full" style={{ background: 'var(--color-brand-100)' }}>
              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${user ? progressPct : 0}%`, background: 'var(--color-brand-500)' }} />
            </div>
            <div className="mt-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
              {user ? `${formatDuration(remainingSeconds)} 남음` : '로그인 후 표시됩니다'}
            </div>
          </div>

          {/* D-DAY 카드 (편집 가능) */}
          <div className="ft-card">
            <div className="flex items-center justify-between">
              <div className="text-sm" style={{ color: 'var(--color-text-soft)' }}>D-DAY</div>
              <button
                type="button"
                onClick={() => tryEdit('dday')}
                className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-blue-50"
                style={{ color: 'var(--color-brand-500)' }}
                aria-label="D-DAY 설정"
              >
                <i className="ti ti-pencil text-lg" aria-hidden="true" />
              </button>
            </div>
            {editingField === 'dday' ? (
              <div className="mt-2 space-y-1.5">
                <input
                  type="date"
                  value={settings.ddayDate ?? ''}
                  onChange={(e) => updateSettings({ ddayDate: e.target.value || null })}
                  className="ft-input w-full px-2 py-1 text-sm"
                />
                <input
                  type="text"
                  value={settings.ddayLabel ?? ''}
                  onChange={(e) => updateSettings({ ddayLabel: e.target.value })}
                  placeholder="예: 2026 수능"
                  className="ft-input w-full px-2 py-1 text-xs"
                  onBlur={() => setEditingField(null)}
                  onKeyDown={(e) => { if (e.key === 'Enter') setEditingField(null); }}
                />
              </div>
            ) : (
              <>
                <div className="mt-2 text-3xl font-semibold" style={{ color: 'var(--color-brand-500)' }}>
                  {ddayLeft == null
                    ? '미설정'
                    : ddayLeft > 0 ? `D-${ddayLeft}` : ddayLeft === 0 ? 'D-DAY' : `D+${Math.abs(ddayLeft)}`}
                </div>
                <div className="mt-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  {settings.ddayLabel ?? (ddayLeft == null ? '날짜를 설정해주세요' : '라벨 없음')}
                </div>
              </>
            )}
          </div>

          <button onClick={goMeasure} className="ft-card-brand flex flex-col items-start justify-between text-left" style={{ minHeight: 130 }}>
            <div className="flex items-center gap-2.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: 'rgba(255,255,255,0.22)' }}>
                <i className="ti ti-player-play text-lg" aria-hidden="true" />
              </div>
              <div>
                <div className="text-xs opacity-90">바로 측정 시작</div>
                <div className="text-base font-semibold">집중 분석</div>
              </div>
            </div>
            <div className="mt-2 flex w-full items-center justify-between">
              <span className="text-xs opacity-85">웹캠 + 심박 + 시선 추적</span>
              <i className="ti ti-arrow-right text-lg" aria-hidden="true" />
            </div>
          </button>
        </section>

        {/* 오늘의 각오 (편집 가능) */}
        <section className="ft-card mb-6">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="text-sm" style={{ color: 'var(--color-text-soft)' }}>오늘의 각오</div>
              {editingField === 'motto' ? (
                <input
                  type="text"
                  value={settings.dailyMotto ?? ''}
                  onChange={(e) => updateSettings({ dailyMotto: e.target.value })}
                  placeholder="예: 이번 달 200시간 채우기. 매일 4시간씩."
                  maxLength={200}
                  className="ft-input mt-1.5 w-full px-2 py-1 text-base"
                  style={{ color: 'var(--color-brand-900)' }}
                  autoFocus
                  onBlur={() => setEditingField(null)}
                  onKeyDown={(e) => { if (e.key === 'Enter') setEditingField(null); }}
                />
              ) : (
                <div className="mt-1 text-base" style={{ color: settings.dailyMotto ? 'var(--color-brand-900)' : 'var(--color-text-muted)' }}>
                  {settings.dailyMotto ?? '클릭해서 각오를 작성하세요 (예: 이번 달 200시간 채우기)'}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => tryEdit('motto')}
              className="ml-3 flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-blue-50"
              style={{ color: 'var(--color-brand-500)' }}
              aria-label="각오 편집"
            >
              <i className="ti ti-pencil text-lg" aria-hidden="true" />
            </button>
          </div>
        </section>

        {/* 스터디룸 입장 — 3 카드 가로 */}
        <section className="mb-6 ft-card">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="text-base font-semibold" style={{ color: 'var(--color-brand-900)' }}>스터디룸 입장</div>
              <div className="mt-0.5 text-xs" style={{ color: 'var(--color-text-soft)' }}>혼자 또는 친구와 함께 집중하기</div>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <button onClick={enterRandomRoom} className="ft-action-card">
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl" style={{ background: 'var(--color-brand-500)', color: 'white', boxShadow: 'var(--shadow-brand)' }}>
                <i className="ti ti-dice text-xl" aria-hidden="true" />
              </div>
              <div className="text-base font-semibold" style={{ color: 'var(--color-brand-900)' }}>랜덤 매칭</div>
              <div className="mt-1 text-xs" style={{ color: 'var(--color-text-soft)' }}>공개 방에 자동 배정됩니다.</div>
            </button>
            <button onClick={createInviteRoom} className="ft-action-card">
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl" style={{ background: 'var(--color-brand-500)', color: 'white', boxShadow: 'var(--shadow-brand)' }}>
                <i className="ti ti-key text-xl" aria-hidden="true" />
              </div>
              <div className="text-base font-semibold" style={{ color: 'var(--color-brand-900)' }}>초대코드 방 만들기</div>
              <div className="mt-1 text-xs" style={{ color: 'var(--color-text-soft)' }}>코드 발급 후 친구에게 공유.</div>
            </button>
            <div className="ft-action-card" style={{ cursor: 'default' }}>
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl" style={{ background: 'var(--color-brand-500)', color: 'white', boxShadow: 'var(--shadow-brand)' }}>
                <i className="ti ti-login text-xl" aria-hidden="true" />
              </div>
              <div className="text-base font-semibold" style={{ color: 'var(--color-brand-900)' }}>초대코드로 입장</div>
              <div className="mt-2 flex gap-1.5">
                <input
                  type="text"
                  value={inviteCodeInput}
                  onChange={(e) => setInviteCodeInput(e.target.value.toUpperCase())}
                  placeholder="ABC123"
                  maxLength={6}
                  className="ft-input flex-1 px-2 py-1.5 text-sm"
                  style={{ background: 'white', textTransform: 'uppercase' }}
                  onKeyDown={(e) => { if (e.key === 'Enter') joinInviteRoom(); }}
                />
                <button onClick={joinInviteRoom} className="rounded-md px-3 text-xs font-semibold text-white" style={{ background: 'var(--color-brand-500)' }}>
                  입장
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* 하단 — 최근 세션 / 명예의 전당 (각자 한 줄씩) */}
        <section className="space-y-4">
          {/* 최근 세션 */}
          <div className="ft-card">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-base font-semibold" style={{ color: 'var(--color-brand-900)' }}>최근 세션</div>
              {user && <button className="ft-btn-ghost text-xs">전체 보기 →</button>}
            </div>
            {!user ? (
              <div className="py-10 text-center">
                <i className="ti ti-history text-3xl mx-auto block" aria-hidden="true" style={{ color: 'var(--color-text-muted)' }} />
                <p className="mt-2 text-sm" style={{ color: 'var(--color-text-muted)' }}>로그인하면 학습 기록이 여기에 표시돼요</p>
              </div>
            ) : data && data.sessions.length > 0 ? (
              <div className="space-y-2">
                {data.sessions.slice(0, 5).map((s) => (
                  <div key={s.id} className="ft-rank-row flex items-center justify-between rounded-lg p-2.5" style={{ background: 'var(--color-bg-soft)' }}>
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: 'var(--color-brand-100)', color: 'var(--color-brand-700)' }}>
                        <i className="ti ti-clock text-sm" aria-hidden="true" />
                      </div>
                      <div>
                        <div className="text-sm font-semibold" style={{ color: 'var(--color-brand-900)' }}>{formatRelativeDate(s.startedAt)}</div>
                        <div className="text-xs" style={{ color: 'var(--color-text-soft)' }}>{formatDuration(s.durationSeconds)}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold" style={{ color: 'var(--color-brand-500)' }}>
                        {formatFocusPercent(s.focusRatio)}
                      </div>
                      <div className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>집중도</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-10 text-center">
                <i className="ti ti-mood-smile text-3xl mx-auto block" aria-hidden="true" style={{ color: 'var(--color-brand-400)' }} />
                <p className="mt-2 text-sm font-semibold" style={{ color: 'var(--color-brand-900)' }}>아직 측정 기록이 없어요</p>
                <p className="mt-1 text-xs" style={{ color: 'var(--color-text-soft)' }}>위 "지금 측정 시작"으로 첫 세션을 만들어보세요</p>
              </div>
            )}
          </div>

          {/* 명예의 전당 */}
          <div className="ft-card">
            <div className="flex items-start justify-between flex-wrap gap-3">
              <div>
                <div className="flex items-center gap-1.5">
                  <i className="ti ti-trophy text-base" aria-hidden="true" style={{ color: 'var(--color-brand-500)' }} />
                  <div className="text-base font-semibold" style={{ color: 'var(--color-brand-900)' }}>
                    {activeRange === 'day' ? '오늘의' : activeRange === 'week' ? '이번 주' : '이번 달'} 명예의 전당
                  </div>
                </div>
                <div className="mt-1 text-xs" style={{ color: 'var(--color-text-soft)' }}>
                  {activeRange === 'day'
                    ? '집중 비율 70% + 측정 시간 30% 가중 점수'
                    : '일별 최고 세션 합산 누적 점수'}
                </div>
              </div>
              {/* Range segmented control */}
              <div className="flex items-center gap-1 rounded-full p-1" style={{ background: 'var(--color-bg-soft)' }}>
                {RANGES.map((r) => (
                  <button
                    key={r.key}
                    onClick={() => setActiveRange(r.key)}
                    className="rounded-full px-3 py-1 text-xs font-semibold transition-colors"
                    style={{
                      background: activeRange === r.key ? 'white' : 'transparent',
                      color: activeRange === r.key ? 'var(--color-brand-700)' : 'var(--color-text-soft)',
                      boxShadow: activeRange === r.key ? 'var(--shadow-sm)' : 'none',
                    }}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-3 mb-3 flex flex-wrap gap-1.5">
              {CATEGORIES.map((c) => (
                <button
                  key={c.key}
                  onClick={() => setActiveCategory(c.key)}
                  className={activeCategory === c.key ? 'ft-chip ft-chip-active' : 'ft-chip'}
                >
                  <i className={`ti ${c.icon} text-xs`} aria-hidden="true" />
                  {c.label}
                </button>
              ))}
            </div>

            {sortedLeaderboard.length === 0 ? (
              <div className="py-10 text-center">
                <i className="ti ti-confetti text-3xl mx-auto block" aria-hidden="true" style={{ color: 'var(--color-text-muted)' }} />
                <p className="mt-2 text-sm" style={{ color: 'var(--color-text-muted)' }}>
                  {activeRange === 'day' ? '오늘' : activeRange === 'week' ? '이번 주' : '이번 달'} 아직 랭킹 데이터가 없어요
                </p>
                <p className="mt-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>첫 1위에 도전해보세요!</p>
              </div>
            ) : (
              <div className="space-y-1">
                {sortedLeaderboard.map((entry, i) => {
                  const rank = i + 1;
                  const isMe = !!user && entry.userId === user.id;
                  const medalBg = rank === 1 ? '#FEF3C7' : rank === 2 ? '#FED7AA' : rank === 3 ? '#FECDD3' : 'var(--color-brand-50)';
                  const medalColor = rank === 1 ? '#92400E' : rank === 2 ? '#9A3412' : rank === 3 ? '#9F1239' : 'var(--color-text-soft)';
                  return (
                    <div key={entry.userId} className="ft-rank-row flex items-center gap-3 rounded-lg p-2"
                      style={isMe ? { background: 'var(--color-brand-50)' } : undefined}>
                      <div className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold" style={{ background: medalBg, color: medalColor }}>{rank}</div>
                      <div className="flex-1 min-w-0">
                        <div className="truncate text-sm font-semibold" style={{ color: 'var(--color-brand-900)' }}>{entry.displayName}{isMe ? ' (나)' : ''}</div>
                        <div className="truncate text-[11px]" style={{ color: 'var(--color-text-muted)' }}>{autoComment(entry)}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold" style={{ color: 'var(--color-brand-900)' }}>
                          {activeCategory === 'score' ? `${Math.round(entry.rankingScore)}점` :
                           activeCategory === 'time' ? formatTime(entry.validSeconds) :
                           formatFocusPercent(entry.focusRatio)}
                        </div>
                        <div className="text-[10px]" style={{ color: 'var(--color-text-soft)' }}>
                          {formatFocusPercent(entry.focusRatio)} · {formatTime(entry.validSeconds)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {user && myRank && !sortedLeaderboard.some((e) => e.userId === user.id) && (
              <>
                <div className="my-2 text-center text-xs" style={{ color: 'var(--color-text-muted)' }}>···</div>
                <div className="flex items-center gap-3 rounded-lg p-2.5" style={{ background: 'var(--color-brand-100)' }}>
                  <div className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold" style={{ background: 'var(--color-brand-500)', color: 'white' }}>{myRank.rank}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold" style={{ color: 'var(--color-brand-900)' }}>{user.name} (나)</div>
                    <div className="text-[11px]" style={{ color: 'var(--color-brand-600)' }}>시간만 늘리면 탑 5</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold" style={{ color: 'var(--color-brand-900)' }}>{Math.round(myRank.rankingScore)}점</div>
                    <div className="text-[10px]" style={{ color: 'var(--color-brand-600)' }}>{formatTime(myRank.validSeconds)}</div>
                  </div>
                </div>
              </>
            )}

            <div className="mt-4 flex items-center justify-between border-t pt-3" style={{ borderColor: 'var(--color-border)' }}>
              <div className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                10분 미만 세션은 제외 · {activeRange === 'day' ? '자정 리셋' : activeRange === 'week' ? '월요일 리셋' : '매월 1일 리셋'}
              </div>
              <button className="ft-btn-ghost text-xs">전체 랭킹 →</button>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
