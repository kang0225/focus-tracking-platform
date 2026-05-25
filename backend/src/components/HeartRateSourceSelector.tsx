'use client';

import type { HeartRateSourcePreference } from '@/types/tracker';

interface HeartRateSourceSelectorProps {
  value: HeartRateSourcePreference;
  onChange: (value: HeartRateSourcePreference) => void;
  disabled?: boolean;
  appleWatchConnected?: boolean;
  className?: string;
}

const OPTIONS: Array<{
  value: HeartRateSourcePreference;
  label: string;
  caption: string;
}> = [
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
    <div className={`space-y-2 ${className}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">심박 소스</p>
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-950/80 p-1 ring-1 ring-slate-700">
        {OPTIONS.map((option) => {
          const selected = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={selected}
              disabled={disabled}
              onClick={() => onChange(option.value)}
              className={`min-h-10 rounded-md px-3 py-2 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${
                selected
                  ? 'bg-cyan-500 text-white shadow-lg shadow-cyan-500/20'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <span className="block text-sm font-semibold leading-4">{option.label}</span>
              <span className={`block text-[10px] leading-4 ${selected ? 'text-cyan-50/85' : 'text-slate-500'}`}>
                {option.value === 'apple-watch' && appleWatchConnected ? '연결됨' : option.caption}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
