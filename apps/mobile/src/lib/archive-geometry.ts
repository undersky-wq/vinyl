export type ArchiveMode = 'shelf' | 'stack' | 'grid' | 'tracks';
export type CoverGeometry = { x: number; y: number; size: number; rotateX: number; rotateZ: number; rotateZAfter: number; scale: number; perspective: number; zIndex: number; opacity?: number };
export type ArchiveSelection = { index: number; expanded: boolean } | null;

export function selectArchiveRelease(current: ArchiveSelection, index: number, mode: ArchiveMode): ArchiveSelection {
  if (current?.index === index) return mode === 'shelf' ? { index, expanded: !current.expanded } : null;
  return { index, expanded: mode !== 'shelf' };
}

export function expandedCoverSize(viewport: { width: number; height: number }) {
  return Math.min(viewport.width * 0.74, 310, viewport.height * 0.38);
}

export function shelfCoverSize({ width, height }: { width: number; height: number }) {
  const gap = Math.max(10, Math.min(16, width * .03));
  // Use the website's vertical fitting rule with the native heading/player bounds.
  const contentTop = Math.max(215, height * .265) + 36 + gap;
  const contentBottom = Math.max(contentTop + 24, height - 54 - gap);
  const available = Math.max(24, contentBottom - contentTop);
  const minimumPanelHeight = Math.min(96, available * .45);
  const fitted = (available - minimumPanelHeight - 28 - gap * 2 - width * .42 * .28) / 1.43;
  return Math.max(64, Math.min(160, width * .48, fitted));
}

export function shelfCenterY({ height }: { width: number; height: number }) {
  // Center in the usable canvas, not a percentage of the full screen.
  return (126 + Math.max(126, height - 78)) / 2;
}

// SVD of the website's matrix(.76,.43,0,1). Android discards affine shear
// when decomposing a View transform, so project a real rotated plane instead.
export const SHELF_PROJECTION = { rotateZ: 66.44852753512718, rotateX: 55.070283510639406, rotateZAfter: -52.71908584445063, scale: 1.1521049916445745 };

export function archiveGridMetrics(width: number) {
  const size = (width * .94 - 30) / 4;
  return { size, step: size + 10, columns: 4, side: width * .03 };
}

export function archiveStep(mode: ArchiveMode, viewport: { width: number; height: number }) {
  if (mode === 'grid') return archiveGridMetrics(viewport.width).step / 4;
  if (mode === 'tracks') return 64;
  if (mode === 'stack') return Math.min(viewport.width * 0.62, viewport.height * 0.32) * 0.48;
  return 24;
}

export function clampPosition(position: number, count: number) {
  return Math.max(0, Math.min(Math.max(0, count - 1), position));
}

export function archiveWindow(position: number, count: number, mode: ArchiveMode) {
  if (mode === 'grid' || mode === 'tracks') {
    const start = Math.max(0, Math.floor(position / (mode === 'grid' ? 4 : 1)) * (mode === 'grid' ? 4 : 1) - (mode === 'grid' ? 4 : 2));
    return Array.from({ length: Math.max(0, Math.min(mode === 'grid' ? 44 : 20, count - start)) }, (_, index) => start + index);
  }
  const radius = mode === 'stack' ? 4 : 16;
  const start = Math.max(0, Math.floor(position) - radius);
  return Array.from({ length: Math.max(0, Math.min(count, Math.ceil(position) + radius + 1) - start) }, (_, index) => start + index);
}

export function archiveGeometry(mode: ArchiveMode, index: number, position: number, viewport: { width: number; height: number }, selection: ArchiveSelection = null): CoverGeometry {
  // Only Shelf has a tilted preview between browsing and the tracklist.
  if (selection && !selection.expanded && mode !== 'shelf') return archiveGeometry(mode, index, position, viewport);
  const { width, height } = viewport;
  const distance = index - position;
  const flat = { rotateX: 0, rotateZ: 0, rotateZAfter: 0, scale: 1, perspective: 1000000, zIndex: 100 + index };
  if (selection?.index === index) {
    const size = selection.expanded ? expandedCoverSize(viewport) : shelfCoverSize(viewport);
    return { ...flat, ...(selection.expanded ? {} : SHELF_PROJECTION), x: (width - size) / 2, y: selection.expanded ? height * .16 : shelfCenterY(viewport) - size / 2, size, zIndex: 20000 };
  }
  if (selection?.expanded) {
    const base = archiveGeometry(mode, index, position, viewport);
    return { ...base, x: base.x + Math.sign(index - selection.index) * width * .75, opacity: 0 };
  }
  if (mode === 'grid') {
    const { size } = archiveGridMetrics(width);
    return { ...flat, x: width * 0.03 + (index % 4) * (size + 10), y: 138 + (Math.floor(index / 4) - position / 4) * (size + 10), size };
  }
  if (mode === 'tracks') return { ...flat, x: width * 0.03, y: 138 + distance * 64, size: 48 };
  if (mode === 'stack') {
    const size = Math.min(width * 0.62, height * 0.32);
    const sceneHeight = Math.max(0, height - 204);
    return { ...flat, x: (width - size) / 2, y: 126 + (sceneHeight - size) / 2 + distance * archiveStep(mode, viewport), size, rotateX: -55, perspective: 1200 };
  }
  const size = shelfCoverSize(viewport);
  const along = width * 0.5 + distance * 24 + (selection ? Math.sign(index - selection.index) * 160 : 0);
  return { x: along - size / 2, y: shelfCenterY(viewport) - distance * 24 * .28 - (selection ? Math.sign(index - selection.index) * 160 * .28 : 0) - size / 2, size, ...SHELF_PROJECTION, perspective: 1000000, zIndex: 10000 - index };
}
