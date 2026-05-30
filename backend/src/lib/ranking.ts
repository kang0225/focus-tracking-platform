/**
 * Issue #163 — 집중 유지율 + 유효 측정 시간 기반 랭킹 점수.
 *
 * MVP 공식 (RANKING_FORMULA_VERSION === 1):
 *   rankingScore = focusRatio * 70 + min(validMinutes / 50, 1) * 30
 *
 * 규칙:
 *   - validMinutes < MIN_VALID_MINUTES (10분)  → 랭킹에서 제외 (eligible=false)
 *   - pause 구간은 validMinutes / focusRatio 계산에서 모두 제외
 *   - 동일 사용자 동일 일자는 최고 점수 1개만 노출 (저장은 다 함)
 *   - 동점이면 highFocusSeconds 가 큰 쪽이 우선
 *
 * 순수 함수. DB / Redis / 시간 의존 없음. 단위테스트하기 쉽게 구성.
 */

export const RANKING_FORMULA_VERSION = 1 as const;
export const TARGET_MINUTES = 50;
export const MIN_VALID_MINUTES = 10;
export const RANKING_TIMEZONE_OFFSET_MS = 9 * 60 * 60 * 1000;

export type RankingRange = 'day' | 'week' | 'month';

export interface RankingInput {
  /** 분석된 focus ratio (0 ~ 1). validSeconds 기준. */
  focusRatio: number;
  /** pause 제외한 유효 측정 시간 (초). */
  validSeconds: number;
}

export interface RankingResult {
  score: number;
  eligible: boolean;
  formulaVersion: typeof RANKING_FORMULA_VERSION;
  components: {
    focusRatio: number;
    validMinutes: number;
    focusComponent: number;
    durationComponent: number;
  };
}

const clamp01 = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
};

export function computeRankingScore(input: RankingInput): RankingResult {
  const focusRatio = clamp01(input.focusRatio);
  const validSeconds = Math.max(0, Math.floor(input.validSeconds));
  const validMinutes = validSeconds / 60;

  const focusComponent = focusRatio * 70;
  const durationComponent = Math.min(validMinutes / TARGET_MINUTES, 1) * 30;
  const score = focusComponent + durationComponent;
  const eligible = validMinutes >= MIN_VALID_MINUTES;

  return {
    score: roundTo(score, 2),
    eligible,
    formulaVersion: RANKING_FORMULA_VERSION,
    components: {
      focusRatio,
      validMinutes: roundTo(validMinutes, 2),
      focusComponent: roundTo(focusComponent, 2),
      durationComponent: roundTo(durationComponent, 2),
    },
  };
}

function roundTo(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/**
 * 세션의 (focusRatio, validSeconds) 로부터 highFocusSeconds 를 역산.
 * ML job 결과에 highFocusSeconds 가 직접 오면 그걸 쓰고,
 * 안 오면 이 함수로 보정 — 동점 tiebreaker 에 사용.
 */
export function highFocusSecondsFromRatio(input: RankingInput): number {
  const focusRatio = clamp01(input.focusRatio);
  const validSeconds = Math.max(0, Math.floor(input.validSeconds));
  return Math.round(focusRatio * validSeconds);
}

/**
 * Date -> "YYYY-MM-DD" (UTC 기준). DB ranking_date 컬럼과 일치.
 * 사용자별 로컬 일자가 필요하면 timezone 파라미터 추가 가능.
 */
export function toRankingDate(at: Date | number): string {
  const d = typeof at === 'number' ? new Date(at) : at;
  return new Date(d.getTime() + RANKING_TIMEZONE_OFFSET_MS).toISOString().slice(0, 10);
}

export function getRankingRangeDates(
  dateStr: string,
  range: RankingRange,
): { start: string; end: string } {
  const [year, month, dayOfMonth] = dateStr.split('-').map(Number);
  const d = new Date(Date.UTC(year, month - 1, dayOfMonth));

  if (range === 'day') return { start: dateStr, end: dateStr };

  if (range === 'week') {
    const day = d.getUTCDay();
    const offsetToMonday = day === 0 ? 6 : day - 1;
    const monday = new Date(d);
    monday.setUTCDate(d.getUTCDate() - offsetToMonday);
    const sunday = new Date(monday);
    sunday.setUTCDate(monday.getUTCDate() + 6);
    return { start: toRankingDate(monday), end: toRankingDate(sunday) };
  }

  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
  return { start: toRankingDate(start), end: toRankingDate(end) };
}
