// Four layouts, with a short readable pause at Stack and Grid.
const LEG_MS = 650;
const HOLD_MS = 140;
export const COLLECTION_LAYOUT_DURATION = LEG_MS * 3 + HOLD_MS * 2;

export function collectionLayoutProgress(elapsed: number, reverse = false) {
  const time = Math.max(0, Math.min(COLLECTION_LAYOUT_DURATION, elapsed));
  const leg = Math.min(2, Math.floor(time / (LEG_MS + HOLD_MS)));
  const t = Math.min(1, (time - leg * (LEG_MS + HOLD_MS)) / LEG_MS);
  const value = leg + t * t * (3 - 2 * t);
  return reverse ? 3 - value : value;
}

export function mergeVisibleReleaseIndices(previous: number[], current: number[], count: number) {
  return [...new Set([...previous, ...current])]
    .filter(index => Number.isInteger(index) && index >= 0 && index < count)
    .sort((a, b) => a - b);
}

/** Virtualized Shelf newcomers start in the offscreen continuation of Stack. */
export function extrapolateStackCoverFrame(frames: Map<string, Keyframe>, index: string, step: number): Keyframe | undefined {
  let nearest: { index: number; frame: Keyframe } | undefined;
  const target = Number(index);
  if (!Number.isFinite(target) || !Number.isFinite(step)) return undefined;
  for (const [key, frame] of frames) {
    const candidate = Number(key);
    if (!Number.isFinite(candidate) || !Number.isFinite(parseFloat(String(frame.top)))) continue;
    if (!nearest || Math.abs(candidate - target) < Math.abs(nearest.index - target)) {
      nearest = { index: candidate, frame };
    }
  }
  if (!nearest) return undefined;
  return { ...nearest.frame, top: `${parseFloat(String(nearest.frame.top)) + (target - nearest.index) * step}px` };
}
