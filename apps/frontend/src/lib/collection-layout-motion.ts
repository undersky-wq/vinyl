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
