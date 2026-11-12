export function squareCoverBounds(width: number, height: number, x: number, y: number, zoom: number) {
  const side = Math.min(width, height) / Math.max(1, Math.min(3, zoom));
  return { x: (width - side) * Math.max(0, Math.min(100, x)) / 100, y: (height - side) * Math.max(0, Math.min(100, y)) / 100, side };
}

export function squareCoverTransform(width: number, height: number, x: number, y: number, zoom: number, degrees: number) {
  const radians = degrees * Math.PI / 180;
  const extent = Math.abs(Math.cos(radians)) + Math.abs(Math.sin(radians));
  const side = Math.min(width, height) / extent / Math.max(1, Math.min(3, zoom));
  const footprint = side * extent;
  return {
    side, radians,
    centerX: footprint / 2 + (width - footprint) * Math.max(0, Math.min(100, x)) / 100,
    centerY: footprint / 2 + (height - footprint) * Math.max(0, Math.min(100, y)) / 100,
  };
}

export function drawSquareCover(context: CanvasRenderingContext2D, source: HTMLImageElement, size: number, x: number, y: number, zoom: number, degrees: number) {
  const crop = squareCoverTransform(source.naturalWidth, source.naturalHeight, x, y, zoom, degrees);
  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, size, size);
  context.fillStyle = '#fff'; context.fillRect(0, 0, size, size);
  context.imageSmoothingQuality = 'high';
  context.translate(size / 2, size / 2);
  context.rotate(crop.radians);
  context.scale(size / crop.side, size / crop.side);
  context.drawImage(source, -crop.centerX, -crop.centerY);
  context.restore();
}
