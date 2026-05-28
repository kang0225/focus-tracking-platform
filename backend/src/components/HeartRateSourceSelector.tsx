'use client';

import type { HeartRateSourcePreference } from '@/types/tracker';

interface HeartRateSourceSelectorProps {
  value: HeartRateSourcePreference;
  onChange: (value: HeartRateSourcePreference) => void;
  disabled?: boolean;
  appleWatchConnected?: boolean;
  className?: string;
}

const OPTIONS: Array<{ value: HeartRateSourcePreference; label: string; caption: string }> = [
  { value: 'webcam', label: '웹캠', caption: 'FacePhys' },
  { value: 'apple-watch', label: 'Apple Watch', caption: 'Watch' },
];

export function HeartRateSourceSelector({
  value,
  onChange,
  disabled = false,
  appleWatchConnected = false,
  className = '',
}: HeartRateSourceSelectorProps) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <p className="text-[10px] font-medium uppercase tracking-widest" style={{ color: 'var(--color-text-soft)' }}>
        심박 소스
      </p>
      <div className="grid grid-cols-2 gap-1 rounded-md p-1" style={{ background: 'var(--color-bg-soft)', border: '1px solid var(--color-border)' }}>
        {OPTIONS.map((option) => {
          const selected = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={selected}
              disabled={disabled}
              onClick={() => onChange(option.value)}
              className="rounded-md px-2.5 py-1.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60"
              style={{
                background: selected ? 'var(--color-brand-500)' : 'transparent',
                color: selected ? 'white' : 'var(--color-text-soft)',
              }}
            >
              <span className="block text-xs font-medium leading-tight">{option.label}</span>
              <span className="block text-[10px] leading-tight" style={{
                color: selected ? 'rgba(255,255,255,0.75)' : 'var(--color-text-muted)',
              }}>
                {option.value === 'apple-watch' && appleWatchConnected ? '연결됨' : option.caption}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
