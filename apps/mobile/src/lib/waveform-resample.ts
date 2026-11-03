// Same energy-preserving resampling as the website; kept in sync by parity tests.
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
