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
  active,
  currentPointIndex,
  pointClickCount,
  clicksPerPoint,
  totalPoints,
  isBusy,
  onPointClick,
  onReset,
}: GazeCalibrationOverlayProps) {
  const progress = useMemo(() => {
    const completedClicks = currentPointIndex * clicksPerPoint + pointClickCount;
    const totalClicks = totalPoints * clicksPerPoint;
    return Math.round((completedClicks / totalClicks) * 100);
  }, [clicksPerPoint, currentPointIndex, pointClickCount, totalPoints]);

  if (!active) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-slate-950/95 text-white backdrop-blur-sm">
      <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center px-4 pt-5">
        <div className="pointer-events-auto w-full max-w-2xl rounded-lg border border-slate-700 bg-slate-900/95 p-4 shadow-2xl">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-cyan-300">시선 보정</p>
              <p className="mt-1 text-sm text-slate-200">
                밝게 표시된 점을 보면서 {clicksPerPoint}번씩 클릭하세요.
              </p>
            </div>
            <button
              type="button"
              onClick={onReset}
              disabled={isBusy}
              className="h-10 rounded-md border border-slate-600 px-4 text-sm font-semibold text-slate-100 transition hover:border-slate-400 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              처음부터
            </button>
          </div>

          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between text-xs text-slate-400">
              <span>{currentPointIndex + 1}/{totalPoints} 위치</span>
              <span>{progress}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full rounded-full bg-cyan-400 transition-[width] duration-200"
                style={{ width: `${progress}%` }}
              />
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
            onClick={() => {
              if (isCurrent && !isBusy) onPointClick(point);
            }}
            disabled={!isCurrent || isBusy}
            aria-label={`${index + 1}번 보정 지점`}
            className={`absolute flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border text-sm font-bold transition ${
              isCurrent
                ? 'cursor-pointer border-cyan-200 bg-cyan-400 text-slate-950 shadow-[0_0_0_10px_rgba(34,211,238,0.12)]'
                : isComplete
                  ? 'cursor-default border-emerald-400/70 bg-emerald-400/20 text-emerald-100'
                  : 'cursor-default border-slate-700 bg-slate-900/90 text-slate-500'
            }`}
            style={{
              left: `${point.xPercent}%`,
              top: `${point.yPercent}%`,
            }}
          >
            {isCurrent ? pointClickCount + 1 : index + 1}
          </button>
        );
      })}
    </div>
  );
}
