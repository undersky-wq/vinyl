'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';

export function waveformPixelGrid(width: number, left: number, scale: number, pixelsPerBar = 4, maxBars = 400) {
  const safeScale = Math.max(.01, scale);
  const start = Math.ceil(left * safeScale);
  const available = Math.max(0, Math.floor((left + width) * safeScale) - start);
  const step = Math.max(2, Math.round(pixelsPerBar * safeScale), Math.ceil(available / Math.max(1, maxBars)));
  const barWidth = Math.max(1, Math.floor(step / 2));
  const count = Math.max(1, Math.min(maxBars, Math.floor((available + step - barWidth) / step)));
  return { count, start: (start - left * safeScale) / safeScale, step: step / safeScale, width: barWidth / safeScale };
}

type ResponsiveWaveformOptions = {
  minBars?: number;
  maxBars?: number;
  pixelsPerBar?: number;
  adaptiveBelowPx?: number;
  snapToDevicePixels?: boolean;
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
  if (!peaks.length) return [];
  const targetCount = Number.isFinite(nextCount) ? Math.max(1, Math.floor(nextCount)) : 1;
  return Array.from({ length: targetCount }, (_, index) => {
    const start = index * peaks.length / targetCount;
    const end = (index + 1) * peaks.length / targetCount;
    let squares = 0;
    for (let sample = Math.floor(start); sample < Math.ceil(end); sample += 1) {
      const weight = Math.max(0, Math.min(end, sample + 1) - Math.max(start, sample));
      const value = Number.isFinite(peaks[sample]) ? Math.max(0, Math.min(1, peaks[sample])) : 0;
      squares += value * value * weight;
    }
    return Number(Math.max(.02, Math.min(1, Math.sqrt(squares / (end - start)))).toFixed(3));
  });
}

export function useResponsiveWaveform(
  sourcePeaks: number[],
  {
    minBars = 56,
    maxBars = 180,
    pixelsPerBar = 4,
    adaptiveBelowPx = 641,
    snapToDevicePixels = false,
  }: ResponsiveWaveformOptions = {},
) {
  const [element, ref] = useState<HTMLButtonElement | null>(null);
  const [barCount, setBarCount] = useState(maxBars);
  const [grid, setGrid] = useState<ReturnType<typeof waveformPixelGrid> | null>(null);

  useEffect(() => {
    if (!element) {
      return;
    }

    const updateBarCount = () => {
      const rect = element.getBoundingClientRect();
      const cssWidth = typeof window.getComputedStyle === 'function' ? parseFloat(window.getComputedStyle(element).width) : 0;
      const width = cssWidth || element.clientWidth || rect.width;
      if (rect.width <= 0 || width <= 0) return;
      if (!snapToDevicePixels) {
        const shouldAdapt = window.matchMedia(`(max-width: ${adaptiveBelowPx - 1}px)`).matches;
        setBarCount(shouldAdapt ? clamp(Math.floor(width / pixelsPerBar), minBars, maxBars) : maxBars);
        return;
      }
      const visualScale = rect.width / Math.max(1, width);
      const scale = (window.devicePixelRatio || 1) * visualScale;
      const next = waveformPixelGrid(width, (rect.left || 0) / visualScale, scale, pixelsPerBar, maxBars);
      setGrid(current => current && Object.keys(next).every(key => current[key as keyof typeof next] === next[key as keyof typeof next]) ? current : next);
      setBarCount(next.count);
    };

    updateBarCount();
    window.addEventListener('resize', updateBarCount);

    if (typeof ResizeObserver === 'undefined') {
      return () => window.removeEventListener('resize', updateBarCount);
    }

    const observer = new ResizeObserver(updateBarCount);

    observer.observe(element);
    return () => { observer.disconnect(); window.removeEventListener('resize', updateBarCount); };
  }, [element, adaptiveBelowPx, maxBars, minBars, pixelsPerBar, snapToDevicePixels]);

  const peaks = useMemo(() => resampleWaveform(sourcePeaks, barCount), [barCount, sourcePeaks]);

  const barStyle = (index: number): CSSProperties => grid ? {
    position: 'absolute', left: grid.start + index * grid.step, width: grid.width,
    minWidth: 0, maxWidth: 'none', flex: 'none', top: '50%', transform: 'translateY(-50%)', borderRadius: 0,
  } : {};
  return { ref, peaks, barCount, barStyle };
}
