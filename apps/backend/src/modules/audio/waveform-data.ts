const PCM_RATE = 8000;
const MIN_POINTS = 1024;
const MAX_POINTS = 8192;

export function waveformPointCount(durationSeconds: number) {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return MIN_POINTS;
  return Math.min(MAX_POINTS, Math.max(MIN_POINTS, Math.ceil(durationSeconds * 4)));
}

export function waveformFromPcm(buffer: Buffer, requestedPoints?: number) {
  const samples = Math.floor(buffer.length / 4);
  if (!samples) return [];
  const points = Math.min(samples, requestedPoints !== undefined && Number.isFinite(requestedPoints)
    ? Math.max(1, Math.min(MAX_POINTS, Math.floor(requestedPoints))) : waveformPointCount(samples / PCM_RATE));
  const energy: number[] = [];
  for (let point = 0; point < points; point += 1) {
    const start = Math.floor(point * samples / points);
    const end = Math.floor((point + 1) * samples / points);
    let squares = 0;
    let peak = 0;
    for (let sample = start; sample < end; sample += 1) {
      const raw = buffer.readFloatLE(sample * 4);
      const value = Number.isFinite(raw) ? Math.min(1, Math.abs(raw)) : 0;
      squares += value * value;
      peak = Math.max(peak, value);
    }
    energy.push(.9 * Math.sqrt(squares / Math.max(1, end - start)) + .1 * peak);
  }
  // A robust reference avoids one isolated transient flattening the rest of the recording.
  const sorted = [...energy].sort((a, b) => a - b);
  const reference = sorted[Math.floor((sorted.length - 1) * .995)] || sorted[sorted.length - 1];
  if (reference < 1e-6) return energy.map(() => .02);
  return energy.map(value => Number(Math.max(.02, Math.min(1, Math.pow(value / reference, 1.5))).toFixed(3)));
}
