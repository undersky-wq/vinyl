function number(value: unknown, fallback = 0) {
  const parsed = Number.parseFloat(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function origin(frame: Keyframe) {
  const values = String(frame.transformOrigin ?? '0 0 0').split(/\s+/);
  return [number(values[0]), number(values[1]), number(values[2])];
}

function margins(frame: Keyframe) {
  const values = String(frame.margin ?? '0').trim().split(/\s+/).map(value => number(value));
  return { top: values[0], left: values[3] ?? values[1] ?? values[0] };
}

function transform(frame: Keyframe) {
  return frame.transform && frame.transform !== 'none' ? String(frame.transform) : 'matrix(1,0,0,1,0,0)';
}

// Layout is committed once. Reconstruct each endpoint in the final border box
// so the browser only interpolates transforms, including the existing 3D tilt.
export function coverCompositorFrames(previous: Keyframe, destination: Keyframe): Keyframe[] | null {
  const width = number(destination.width);
  const height = number(destination.height);
  const oldWidth = number(previous.width);
  const oldHeight = number(previous.height);
  if (Math.min(width, height, oldWidth, oldHeight) <= 0) return null;
  const fromOrigin = origin(previous);
  const toOrigin = origin(destination);
  const beforeMargin = margins(previous);
  const afterMargin = margins(destination);
  const dx = number(previous.left) + beforeMargin.left - number(destination.left) - afterMargin.left;
  const dy = number(previous.top) + beforeMargin.top - number(destination.top) - afterMargin.top;
  const endpoint = (frame: Keyframe, point: number[], x: number, y: number, sx: number, sy: number): Keyframe => ({
    transformOrigin: '0px 0px 0px',
    transform: `translate3d(${x}px,${y}px,0px) translate3d(${point[0]}px,${point[1]}px,${point[2]}px) ${transform(frame)} translate3d(${-point[0]}px,${-point[1]}px,${-point[2]}px) scale3d(${sx},${sy},1)`,
    opacity: number(frame.opacity, 1),
  });
  return [endpoint(previous, fromOrigin, dx, dy, oldWidth / width, oldHeight / height),
    endpoint(destination, toOrigin, 0, 0, 1, 1)];
}

export type CoverEntryScene = { layout: 'shelf' | 'stack' | 'grid' | 'tracks'; width: number; height: number };

// Newly mounted covers have no painted source frame. Continue the old deck's
// ordering from outside the viewport rather than fading them in at the target.
export function coverEntryFrame(frames: Map<string, Keyframe>, index: string, destination: Keyframe, scene: CoverEntryScene): Keyframe {
  const target = number(index);
  let nearest: { index: number; frame: Keyframe } | undefined;
  for (const [key, frame] of frames) {
    const candidate = Number(key);
    if (!Number.isFinite(candidate) || number(frame.width) <= 0 || number(frame.height) <= 0) continue;
    if (!nearest || Math.abs(candidate - target) < Math.abs(nearest.index - target)) nearest = { index: candidate, frame };
  }
  const source = nearest?.frame ?? destination;
  const side = nearest && target < nearest.index ? -1 : 1;
  const size = Math.max(number(source.width), number(source.height), 64);
  const clearance = size * 2 + 32;
  const depth = Math.min(10, Math.abs(target - (nearest?.index ?? target))) * Math.min(32, size * .08);
  if (scene.layout === 'shelf') return {
    ...source, left: `${side > 0 ? scene.width + clearance + depth : -clearance - depth}px`, opacity: 1,
  };
  const verticalSide = scene.layout === 'stack' ? -side : side;
  return {
    ...source, top: `${verticalSide > 0 ? scene.height + clearance + depth : -clearance - depth}px`, opacity: 1,
  };
}
