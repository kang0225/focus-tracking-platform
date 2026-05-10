import { useEffect, useMemo, useRef, useState } from 'react';

interface Coordinates {
  x: number;
  y: number;
}

interface GazeSample extends Coordinates {
  timeMs: number;
}

function isValidCoordinate(value: Coordinates) {
  return Number.isFinite(value.x)
    && Number.isFinite(value.y)
    && value.x > 0
    && value.y > 0;
}

export function useRollingGazeAverage(coordinates: Coordinates, enabled = true, windowSeconds = 10) {
  const latestCoordinatesRef = useRef(coordinates);
  const [samples, setSamples] = useState<GazeSample[]>([]);

  useEffect(() => {
    latestCoordinatesRef.current = coordinates;
  }, [coordinates]);

  useEffect(() => {
    if (!enabled) {
      setSamples([]);
      return undefined;
    }

    const sample = () => {
      const latest = latestCoordinatesRef.current;
      if (!isValidCoordinate(latest)) return;

      const now = Date.now();
      const cutoff = now - windowSeconds * 1000;
      setSamples((current) => [
        ...current.filter((item) => item.timeMs >= cutoff),
        { x: latest.x, y: latest.y, timeMs: now },
      ]);
    };

    sample();
    const interval = window.setInterval(sample, 500);
    return () => window.clearInterval(interval);
  }, [enabled, windowSeconds]);

  return useMemo<Coordinates>(() => {
    if (samples.length === 0) return { x: 0, y: 0 };

    const total = samples.reduce((acc, sample) => ({
      x: acc.x + sample.x,
      y: acc.y + sample.y,
    }), { x: 0, y: 0 });

    return {
      x: Math.round(total.x / samples.length),
      y: Math.round(total.y / samples.length),
    };
  }, [samples]);
}
