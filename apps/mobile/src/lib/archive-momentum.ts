import { clampPosition } from './archive-geometry';

// Velocity is releases/ms. A cubic ease-out starts at the release velocity.
export function archiveMomentum(position: number, velocity: number, count: number) {
  const speed = Math.max(-0.035, Math.min(0.035, velocity));
  const duration = Math.min(1100, Math.max(240, Math.abs(speed) * 50000));
  const target = clampPosition(position + speed * duration / 3, count);
  const travel = Math.abs(target - position);
  return { target, duration: Math.abs(speed) < 0.00015 || travel < 0.001 ? 0 : Math.min(duration, 3 * travel / Math.abs(speed)) };
}
