export function shelfMobileLayout(width: number, height: number, searchBottom: number, navigationHeight: number, headingHeight: number, playerTop: number, compact: boolean) {
  const gap = Math.max(10, Math.min(16, width * .03));
  const navigationTop = searchBottom + gap * 2;
  const headingTop = compact ? searchBottom + gap : navigationTop + navigationHeight + gap;
  const contentTop = headingTop + headingHeight + (compact ? Math.max(36, gap * 3) : gap);
  const contentBottom = Math.max(contentTop + 24, playerTop - gap);
  const available = Math.max(24, contentBottom - contentTop);
  // Reserve All plus several genre rows even when browser toolbars reduce
  // the usable screen. Normal phones shrink only from 180px to at most 160px.
  const minimumPanelHeight = Math.min(96, available * .45);
  const fittedCoverSize = (available - minimumPanelHeight - 28 - gap * 2 - width * .42 * .28) / 1.43;
  const coverSize = Math.max(64, Math.min(compact ? 180 : 160, width * .48, compact ? available * .58 : fittedCoverSize));
  const shelfFloor = compact ? contentTop + available * .62 : Math.min(contentBottom - gap, contentTop + gap + 28 + coverSize * .715 + (width + coverSize * .38) * .28);
  const rightCoverBottom = shelfFloor + coverSize * .715 - (width * .58 + coverSize * .38) * .28;
  const panelHeight = compact ? Math.min(192, available * .64) : Math.max(minimumPanelHeight, Math.min(192, contentBottom - rightCoverBottom - gap));
  return {
    navigationTop, headingTop, contentTop,
    bottom: Math.max(0, height - contentBottom),
    coverSize,
    shelfFloor,
    panelHeight,
  };
}
