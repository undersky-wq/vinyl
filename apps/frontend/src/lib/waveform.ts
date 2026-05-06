'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

type ResponsiveWaveformOptions = {
  minBars?: number;
  maxBars?: number;
  pixelsPerBar?: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max));
}

export function buildFallbackWaveform(seed: string, points = 180) {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }

  return Array.from({ length: points }, (_, index) => {
    hash = (hash * 1664525 + 1013904223 + index) >>> 0;
    const value = 0.2 + ((hash % 1000) / 1000) * 0.8;
    return Number(value.toFixed(3));
  });
}

export function resampleWaveform(peaks: number[], nextCount: number) {
  const targetCount = Math.max(1, Math.floor(nextCount));
  if (!peaks.length) {
    return [];
  }

  if (peaks.length === targetCount) {
    return peaks;
  }

  return Array.from({ length: targetCount }, (_, index) => {
    const start = (index / targetCount) * peaks.length;
    const end = ((index + 1) / targetCount) * peaks.length;
    const startIndex = Math.floor(start);
    const endIndex = Math.max(startIndex + 1, Math.ceil(end));
    const bucket = peaks.slice(startIndex, endIndex);
    const peak = bucket.length ? Math.max(...bucket) : peaks[Math.min(startIndex, peaks.length - 1)] || 0;
    return Number(clamp(peak, 0.04, 1).toFixed(3));
  });
}

export function useResponsiveWaveform(
  sourcePeaks: number[],
  {
    minBars = 56,
    maxBars = 180,
    pixelsPerBar = 4,
  }: ResponsiveWaveformOptions = {},
) {
  const ref = useRef<HTMLButtonElement | null>(null);
  const [barCount, setBarCount] = useState(maxBars);

  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === 'undefined') {
      return;
    }

    const updateBarCount = (width: number) => {
      setBarCount(clamp(Math.floor(width / pixelsPerBar), minBars, maxBars));
    };

    updateBarCount(element.getBoundingClientRect().width);

    const observer = new ResizeObserver(([entry]) => {
      updateBarCount(entry.contentRect.width);
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, [maxBars, minBars, pixelsPerBar]);

  const peaks = useMemo(() => resampleWaveform(sourcePeaks, barCount), [barCount, sourcePeaks]);

  return { ref, peaks, barCount };
}
