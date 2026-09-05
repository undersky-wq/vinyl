export const HELD_SEEK_STEP_MS = 5000;
export const HELD_SEEK_INTERVAL_MS = 320;

export function getHeldSeekPosition(
  positionMs: number,
  durationMs: number,
  direction: -1 | 1,
) {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return 0;
  const position = Number.isFinite(positionMs) ? positionMs : 0;
  return Math.max(0, Math.min(durationMs, position + direction * HELD_SEEK_STEP_MS));
}
