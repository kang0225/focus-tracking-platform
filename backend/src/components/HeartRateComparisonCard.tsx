import type { HeartRateComparison } from '@/types/tracker';

interface HeartRateComparisonCardProps {
  comparison: HeartRateComparison;
  className?: string;
}

const LEVEL_STYLE = {
  high: {
    accent: 'var(--color-success)',
    background: 'var(--color-brand-50)',
    border: 'var(--color-brand-200)',
  },
  medium: {
    accent: 'var(--color-warning)',
    background: '#FFF7ED',
    border: '#FED7AA',
  },
  low: {
    accent: 'var(--color-danger)',
    background: '#FEF2F2',
    border: '#FECACA',
  },
  unavailable: {
    accent: 'var(--color-text-muted)',
    background: 'var(--color-bg-soft)',
    border: 'var(--color-border)',
  },
};

function formatBpm(value: number) {
  return value > 0 ? String(value) : '--';
}

function formatDifference(value: number | null) {
  return value == null ? '--' : `${value}`;
}

export function HeartRateComparisonCard({ comparison, className = '' }: HeartRateComparisonCardProps) {
  const style = LEVEL_STYLE[comparison.level];
  const progress = comparison.reliabilityScore ?? 0;

  return (
    <div className={`ft-card ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium" style={{ color: 'var(--color-brand-900)' }}>심박 측정 신뢰도</p>
          <p className="mt-1 text-xs leading-5" style={{ color: 'var(--color-text-soft)' }}>{comparison.description}</p>
        </div>
        <span
          className="shrink-0 rounded-full px-2.5 py-1 text-xs font-medium"
          style={{ color: style.accent, background: style.background, border: `1px solid ${style.border}` }}
        >
          {comparison.label}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-md px-2 py-2" style={{ background: 'var(--color-bg-soft)' }}>
          <p className="text-base font-medium" style={{ color: 'var(--color-brand-700)' }}>{formatBpm(comparison.webcamHeartRate)}</p>
          <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>웹캠</p>
        </div>
        <div className="rounded-md px-2 py-2" style={{ background: 'var(--color-bg-soft)' }}>
          <p className="text-base font-medium" style={{ color: 'var(--color-brand-700)' }}>{formatBpm(comparison.appleWatchHeartRate)}</p>
          <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>Watch</p>
        </div>
        <div className="rounded-md px-2 py-2" style={{ background: 'var(--color-bg-soft)' }}>
          <p className="text-base font-medium" style={{ color: style.accent }}>{formatDifference(comparison.differenceBpm)}</p>
          <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>차이</p>
        </div>
      </div>

      <div className="mt-3">
        <div className="h-2 overflow-hidden rounded-full" style={{ background: 'var(--color-bg-soft)' }}>
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${progress}%`, background: style.accent }}
          />
        </div>
        <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
          <span>{comparison.status}</span>
          <span>{comparison.reliabilityScore == null ? '--' : `${comparison.reliabilityScore}%`}</span>
        </div>
      </div>
    </div>
  );
}
