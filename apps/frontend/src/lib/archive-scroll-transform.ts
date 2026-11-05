export type ArchiveScrollProjection = {
  stack: boolean;
  mobile: boolean;
  width: number;
  height: number;
};

// Move the whole deck in screen coordinates. The individual sleeves retain
// their existing position, perspective and flip transforms.
export function archiveScrollTransform(offset: number, origin: number, projection: ArchiveScrollProjection) {
  const delta = offset - origin;
  const x = projection.stack ? 0 : -delta;
  const y = projection.stack
    ? delta * (projection.mobile ? 4 : 1.6)
    : delta * (projection.mobile ? .28 : projection.height / Math.max(1, projection.width));
  return `translate3d(${x}px, ${y}px, 0)`;
}
