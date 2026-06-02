'use client';

interface AppleWatchHeartRateCardProps {
  heartRate?: number | null;
  isConnected?: boolean;
  compact?: boolean;
  className?: string;
}

function isValidHeartRate(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

export function AppleWatchHeartRateCard({
  heartRate,
  isConnected = false,
  compact = false,
  className = '',
}: AppleWatchHeartRateCardProps) {
  const hasHeartRate = isValidHeartRate(heartRate);
  const status = hasHeartRate
    ? '수신 중'
    : isConnected
      ? '대기 중'
      : '연결 대기';

  return (
    <div
      className={`${compact ? 'rounded-xl px-3 py-2.5' : 'ft-card'} ${className}`.trim()}
      style={{
        background: compact ? 'rgba(255,255,255,0.95)' : 'var(--color-brand-50)',
        border: `1px solid ${isConnected ? 'var(--color-brand-200)' : 'var(--color-border)'}`,
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase" style={{ color: 'var(--color-text-soft)' }}>
            내 Apple Watch
          </p>
          <p
            className={compact ? 'text-2xl font-medium' : 'mt-2 text-3xl font-medium'}
            style={{ color: hasHeartRate ? 'var(--color-danger)' : 'var(--color-brand-900)' }}
          >
            {hasHeartRate ? Math.round(heartRate) : '--'}
          </p>
        </div>
        <span
          className="inline-flex h-7 w-7 items-center justify-center rounded-full"
          style={{
            background: isConnected ? 'var(--color-brand-100)' : 'var(--color-bg-soft)',
            color: isConnected ? 'var(--color-brand-700)' : 'var(--color-text-muted)',
          }}
          title="Apple Watch"
        >
          <i className="ti ti-device-watch text-sm" aria-hidden="true" />
        </span>
      </div>
      <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
        {hasHeartRate ? 'bpm' : status}
      </p>
    </div>
  );
}
