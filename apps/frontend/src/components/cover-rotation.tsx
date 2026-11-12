'use client';

import { useEffect, useRef, type PointerEvent, type ReactNode } from 'react';
import { useShelfDesignSettings } from '../lib/shelf-design-settings';
import './cover-rotation.css';

type Grip = { id: number; x: number; y: number; pitch: number; yaw: number; moved: boolean };

export function CoverRotation({ children }: { children: ReactNode }) {
  const { spinEnabled } = useShelfDesignSettings();
  const surface = useRef<HTMLSpanElement>(null);
  const grip = useRef<Grip | null>(null);
  const motion = useRef({ pitch: 0, yaw: 0, targetPitch: 0, targetYaw: 0 });
  const frame = useRef(0);
  const blockedUntil = useRef(0);

  function draw() {
    frame.current = 0;
    const node = surface.current;
    if (!node) return;
    const state = motion.current;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const ease = reduced ? 1 : grip.current ? .3 : .14;
    state.pitch += (state.targetPitch - state.pitch) * ease;
    state.yaw += (state.targetYaw - state.yaw) * ease;
    const settled = Math.abs(state.pitch - state.targetPitch) + Math.abs(state.yaw - state.targetYaw) < .05;
    if (settled && !grip.current) {
      motion.current = { pitch: 0, yaw: 0, targetPitch: 0, targetYaw: 0 };
      node.style.transform = '';
      return;
    }
    node.style.transform = `perspective(1000px) rotateX(${state.pitch}deg) rotateY(${state.yaw}deg)`;
    if (!settled) frame.current = requestAnimationFrame(draw);
  }
  function wake() { if (!frame.current) frame.current = requestAnimationFrame(draw); }
  function finish(event: PointerEvent<HTMLSpanElement>) {
    const held = grip.current;
    if (!held || held.id !== event.pointerId) return;
    grip.current = null;
    if (held.moved) {
      blockedUntil.current = performance.now() + 700;
      event.preventDefault(); event.stopPropagation();
    }
    event.currentTarget.removeAttribute('data-gripped');
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    // Return to the nearest full turn without changing the selected A/B side.
    motion.current.targetPitch = Math.round(motion.current.pitch / 360) * 360;
    motion.current.targetYaw = Math.round(motion.current.yaw / 360) * 360;
    wake();
  }
  useEffect(() => {
    const node = surface.current;
    const reset = () => {
      cancelAnimationFrame(frame.current); frame.current = 0;
      const held = grip.current; grip.current = null;
      if (node && held && node.hasPointerCapture(held.id)) node.releasePointerCapture(held.id);
      motion.current = { pitch: 0, yaw: 0, targetPitch: 0, targetYaw: 0 };
      if (node) { node.style.transform = ''; node.removeAttribute('data-gripped'); }
    };
    const hidden = () => { if (document.hidden) reset(); };
    if (!spinEnabled) reset();
    window.addEventListener('blur', reset);
    document.addEventListener('visibilitychange', hidden);
    return () => { reset(); window.removeEventListener('blur', reset); document.removeEventListener('visibilitychange', hidden); };
  }, [spinEnabled]);

  return <span ref={surface} className="cover-rotation-surface" data-rotation-enabled={spinEnabled}
    onPointerDown={event => {
      if (!spinEnabled || !event.isPrimary || event.button !== 0 || grip.current) return;
      blockedUntil.current = 0;
      grip.current = { id: event.pointerId, x: event.clientX, y: event.clientY, pitch: motion.current.pitch, yaw: motion.current.yaw, moved: false };
      event.currentTarget.setPointerCapture(event.pointerId);
    }}
    onPointerMove={event => {
      const held = grip.current;
      if (!held || held.id !== event.pointerId) return;
      const dx = event.clientX - held.x, dy = event.clientY - held.y;
      if (!held.moved && Math.hypot(dx, dy) < 5) return;
      held.moved = true;
      event.currentTarget.setAttribute('data-gripped', 'true');
      event.preventDefault(); event.stopPropagation();
      motion.current.targetPitch = held.pitch - dy * .7;
      motion.current.targetYaw = held.yaw + dx * .85;
      wake();
    }}
    onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish}
    onClickCapture={event => {
      if (event.detail > 0 && performance.now() < blockedUntil.current) {
        event.preventDefault(); event.stopPropagation(); blockedUntil.current = 0;
      }
    }}
    onDragStart={event => { if (spinEnabled) event.preventDefault(); }}
  >{children}</span>;
}
