export function clampPlaylistPopup(x: number, y: number, width: number, height: number, viewportWidth: number, viewportHeight: number) {
  const margin = 12;
  return {
    x: Math.max(margin, Math.min(x, viewportWidth - width - margin)),
    y: Math.max(margin, Math.min(y, viewportHeight - height - margin)),
  };
}

export function placePlaylistPopup(anchor: { left: number; right: number; top: number }, width: number, height: number, viewportWidth: number, viewportHeight: number) {
  const right = anchor.right + 16;
  const left = anchor.left - width - 16;
  return clampPlaylistPopup(right + width <= viewportWidth - 12 ? right : left >= 12 ? left : right, anchor.top, width, height, viewportWidth, viewportHeight);
}
