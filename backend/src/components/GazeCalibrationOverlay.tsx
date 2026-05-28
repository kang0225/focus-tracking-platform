'use client';

import { useMemo } from 'react';

export interface CalibrationPoint {
  id: string;
  xPercent: number;
  yPercent: number;
}

interface GazeCalibrationOverlayProps {
  active: boolean;
  currentPointIndex: number;
  pointClickCount: number;
  clicksPerPoint: number;
  totalPoints: number;
  isBusy: boolean;
  onPointClick: (point: CalibrationPoint) => void;
  onReset: () => void;
}

const CALIBRATION_POINTS: CalibrationPoint[] = [
  { id: 'top-left', xPercent: 10, yPercent: 12 },
  { id: 'top-center', xPercent: 50, yPercent: 12 },
  { id: 'top-right', xPercent: 90, yPercent: 12 },
  { id: 'middle-left', xPercent: 10, yPercent: 50 },
  { id: 'middle-center', xPercent: 50, yPercent: 50 },
  { id: 'middle-right', xPercent: 90, yPercent: 50 },
  { id: 'bottom-left', xPercent: 10, yPercent: 88 },
  { id: 'bottom-center', xPercent: 50, yPercent: 88 },
  { id: 'bottom-right', xPercent: 90, yPercent: 88 },
];

export function GazeCalibrationOverlay({
  active, currentPointIndex, pointClickCount, clicksPerPoint, totalPoints, isBusy, onPointClick, onReset,
}: GazeCalibrationOverlayProps) {
  const progress = useMemo(() => {
    const completed = currentPointIndex * clicksPerPoint + pointClickCount;
    const total = totalPoints * clicksPerPoint;
    return Math.round((completed / total) * 100);
  }, [clicksPerPoint, currentPointIndex, pointClickCount, totalPoints]);

  if (!active) return null;

  return (
    <div className="fixed inset-0 z-[100]" style={{ background: 'rgba(255, 255, 255, 0.96)', backdropFilter: 'blur(6px)' }}>
      <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center px-4 pt-5">
        <div className="pointer-events-auto w-full max-w-2xl ft-card">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-medium" style={{ color: 'var(--color-brand-600)' }}>시선 보정</p>
              <p className="mt-0.5 text-sm" style={{ color: 'var(--color-brand-900)' }}>
                밝게 표시된 점을 보면서 {clicksPerPoint}번씩 클릭하세요.
              </p>
            </div>
            <button
              type="button"
              onClick={onReset}
              disabled={isBusy}
              className="ft-btn-secondary text-xs disabled:cursor-not-allowed disabled:opacity-60"
            >
              처음부터
            </button>
          </div>

          <div className="mt-3">
            <div className="mb-1.5 flex items-center justify-between text-[11px]" style={{ color: 'var(--color-text-soft)' }}>
              <span>{currentPointIndex + 1}/{totalPoints} 위치</span>
              <span>{progress}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--color-brand-100)' }}>
              <div className="h-full rounded-full transition-[width] duration-200" style={{ width: `${progress}%`, background: 'var(--color-brand-500)' }} />
            </div>
          </div>
        </div>
      </div>

      {CALIBRATION_POINTS.map((point, index) => {
        const isCurrent = index === currentPointIndex;
        const isComplete = index < currentPointIndex;
        return (
          <button
            key={point.id}
            type="button"
            onClick={() => { if (isCurrent && !isBusy) onPointClick(point); }}
            disabled={!isCurrent || isBusy}
            aria-label={`${index + 1}번 보정 지점`}
            className="absolute flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-sm font-medium transition-all"
            style={{
              left: `${point.xPercent}%`,
              top: `${point.yPercent}%`,
              background: isCurrent ? 'var(--color-brand-500)' : isComplete ? 'var(--color-success)' : 'var(--color-brand-100)',
              color: isCurrent || isComplete ? 'white' : 'var(--color-text-muted)',
              boxShadow: isCurrent ? '0 0 0 8px rgba(14, 165, 233, 0.15)' : 'none',
              cursor: isCurrent ? 'pointer' : 'default',
            }}
          >
            {isCurrent ? pointClickCount + 1 : index + 1}
          </button>
        );
      })}
    </div>
  );
}
