import type { MinuteHeartRateAverage } from '@/hooks/useMinuteHeartRateAverages';

interface MinuteHeartRateAverageBoxProps {
  averages: MinuteHeartRateAverage[];
  compact?: boolean;
}

export function MinuteHeartRateAverageBox({ averages, compact = false }: MinuteHeartRateAverageBoxProps) {
  const rows = compact ? averages.slice(0, 3) : averages;

  return (
    <div className="rounded-xl bg-slate-950/90 px-4 py-3 ring-1 ring-slate-600/50">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-[10px] font-semibold uppercase text-slate-400">분단위 평균</p>
        <p className="text-[10px] text-slate-500">bpm</p>
      </div>

      {rows.length > 0 ? (
        <div className="space-y-1.5">
          {rows.map((item) => (
            <div key={item.minuteStartMs} className="flex items-center justify-between gap-3 text-xs">
              <span className="truncate text-slate-400">{item.label}</span>
              <span className="shrink-0 font-semibold text-rose-300">{item.averageBpm}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-slate-500">평균 계산 대기 중</p>
      )}
    </div>
  );
}
