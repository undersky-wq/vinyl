// Same exponential smoothing as Surf, independent of display refresh rate.
export function shelfScrollStep(current: number, target: number, elapsedMs: number, reduced = false) {
  if (reduced) return target;
  const frames = Math.max(0, Math.min(50, elapsedMs)) / (1000 / 60);
  return current + (target - current) * (1 - Math.pow(.88, frames));
}
