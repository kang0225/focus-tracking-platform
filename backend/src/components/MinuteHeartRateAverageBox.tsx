import type { MinuteHeartRateAverage } from '@/hooks/useMinuteHeartRateAverages';

interface MinuteHeartRateAverageBoxProps {
  averages: MinuteHeartRateAverage[];
  compact?: boolean;
}

export function MinuteHeartRateAverageBox({ averages, compact = false }: MinuteHeartRateAverageBoxProps) {
  const rows = compact ? averages.slice(0, 3) : averages;

  return (
    <div className="rounded-xl px-3 py-2.5" style={{ background: 'rgba(255,255,255,0.95)', border: '1px solid var(--color-border)' }}>
      <div className="mb-1.5 flex items-center justify-between">
        <p className="text-[10px] font-medium uppercase" style={{ color: 'var(--color-text-soft)' }}>분단위 평균</p>
        <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>bpm</p>
      </div>

      {rows.length > 0 ? (
        <div className="space-y-1">
          {rows.map((item) => (
            <div key={item.minuteStartMs} className="flex items-center justify-between gap-3 text-xs">
              <span className="truncate" style={{ color: 'var(--color-text-soft)' }}>{item.label}</span>
              <span className="shrink-0 font-medium" style={{ color: 'var(--color-danger)' }}>{item.averageBpm}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>평균 계산 대기 중</p>
      )}
    </div>
  );
}
