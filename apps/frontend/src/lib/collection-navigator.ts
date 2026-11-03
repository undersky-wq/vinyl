export const clampNavigator = (value: number, maximum = 1) => Math.max(0, Math.min(maximum, value));

export function collectionGridGeometry(width: number, columns: number, gap: number, sleeveSize: number, reserveNavigator: boolean) {
  const mobile = width <= 700;
  // Mobile only reserves the seek target; its playing-release marker is hidden.
  const gutter = mobile && reserveNavigator ? 24 : 0;
  const available = width * (mobile ? .94 : .8) - gutter;
  const fitted = Math.max(24, (available - gap * (columns - 1)) / columns);
  const size = mobile ? fitted : Math.min(sleeveSize, fitted);
  return { size, left: (width - gutter - (columns * size + (columns - 1) * gap)) / 2 };
}

export function gridNavigatorPositions(count: number, columns: number, top: number, cell: number) {
  return Array.from({ length: count }, (_, index) => top + 12 + Math.floor(index / columns) * cell);
}

export function stackNavigatorState(positions: number[], width: number, travel: number) {
  const maximum = positions.at(-1) || 0;
  const center = clampNavigator(travel + width / 2, maximum);
  let index = 0;
  positions.forEach((position, i) => {
    if (Math.abs(position - center) < Math.abs((positions[index] || 0) - center)) index = i;
  });
  return { maximum, index, progress: maximum ? center / maximum : 0 };
}

export function stackNavigatorTravel(positions: number[], width: number, progress: number) {
  return clampNavigator(progress) * (positions.at(-1) || 0) - width / 2;
}

export function releaseScrollTop(positions: number[], index: number, inset: number, maximum: number) {
  return clampNavigator((positions[index] ?? inset) - inset, maximum);
}

export function navigatorIndex(positions: number[], scrollTop: number, inset: number, maximum: number) {
  if (!positions.length || scrollTop <= 0) return 0;
  if (maximum > 0 && scrollTop >= maximum - 1) return positions.length - 1;
  const y = scrollTop + inset + 1;
  let low = 0;
  let high = positions.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (positions[middle] <= y) low = middle + 1;
    else high = middle;
  }
  const previous = Math.max(0, low - 1);
  let index = low < positions.length && Math.abs(positions[low] - y) < Math.abs(positions[previous] - y) ? low : previous;
  // Several covers share one grid row; report its first release rather than the last column.
  while (index > 0 && positions[index - 1] === positions[index]) index--;
  return index;
}
