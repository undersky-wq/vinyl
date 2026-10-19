export function squareCoverBounds(width: number, height: number, x: number, y: number, zoom: number) {
  const side = Math.min(width, height) / Math.max(1, Math.min(3, zoom));
  return { x: (width - side) * Math.max(0, Math.min(100, x)) / 100, y: (height - side) * Math.max(0, Math.min(100, y)) / 100, side };
}
