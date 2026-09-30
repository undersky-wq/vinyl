'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { getHomeReleaseDetails } from '../lib/api';
import { usePlayerTransport } from '../providers/player-provider';
import styles from './techno-dancer.module.css';

export function TechnoDancer() {
  const { currentTrack, isPlaying } = usePlayerTransport();
  const releaseId = currentTrack?.releaseId;
  const [genres, setGenres] = useState<Record<string, boolean>>({});
  const [reducedMotion, setReducedMotion] = useState(true);
  const knownGenre = releaseId ? genres[releaseId] : undefined;
  const pathname = usePathname();
  const dancerRef = useRef<HTMLButtonElement>(null);
  const positionRef = useRef<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ id: number; dx: number; dy: number } | null>(null);
  const visible = isPlaying && Boolean(knownGenre) && !reducedMotion;

  function place(x: number, y: number) {
    const dancer = dancerRef.current;
    if (!dancer) return;
    const left = Math.max(0, Math.min(x, window.innerWidth - dancer.offsetWidth));
    const top = Math.max(0, Math.min(y, window.innerHeight - dancer.offsetHeight));
    dancer.style.left = `${left}px`;
    dancer.style.top = `${top}px`;
    return { x: left, y: top };
  }

  useLayoutEffect(() => {
    if (!visible) return;
    const player = document.querySelector('.mini-player');
    const updatePosition = () => {
      const dancer = dancerRef.current;
      if (!dancer) return;
      if (positionRef.current) {
        positionRef.current = place(positionRef.current.x, positionRef.current.y) ?? null;
        return;
      }
      const bounds = player?.getBoundingClientRect();
      place(
        (bounds ? bounds.left + bounds.width / 2 : window.innerWidth / 2) - dancer.offsetWidth / 2,
        (bounds?.top ?? window.innerHeight - 90) - dancer.offsetHeight - 8,
      );
    };
    updatePosition();
    const observer = new ResizeObserver(updatePosition);
    if (player) observer.observe(player);
    if (dancerRef.current) observer.observe(dancerRef.current);
    window.addEventListener('resize', updatePosition);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updatePosition);
      dragRef.current = null;
    };
  }, [visible, pathname]);

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(preference.matches);
    update();
    preference.addEventListener('change', update);
    return () => preference.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (!releaseId || !isPlaying || reducedMotion || knownGenre !== undefined) return;
    let cancelled = false;
    getHomeReleaseDetails(releaseId).then(release => {
      if (cancelled) return;
      const techno = release.styles.some(style => style.trim().toLowerCase() === 'techno');
      setGenres(previous => ({ ...previous, [releaseId]: techno }));
    }).catch(() => {
      // A failed metadata request must not interrupt playback or show the wrong dancer.
    });
    return () => { cancelled = true; };
  }, [releaseId, isPlaying, reducedMotion, knownGenre]);

  if (!visible) return null;

  return (
    <button
      ref={dancerRef}
      type="button"
      className={styles.dancer}
      aria-label="Move dancer with arrow keys"
      title="Drag to move"
      onPointerDown={event => {
        if (event.button !== 0 || !event.isPrimary) return;
        event.preventDefault();
        event.stopPropagation();
        const bounds = event.currentTarget.getBoundingClientRect();
        dragRef.current = { id: event.pointerId, dx: event.clientX - bounds.left, dy: event.clientY - bounds.top };
        event.currentTarget.setPointerCapture(event.pointerId);
        event.currentTarget.dataset.dragging = 'true';
      }}
      onPointerMove={event => {
        const drag = dragRef.current;
        if (!drag || drag.id !== event.pointerId) return;
        event.stopPropagation();
        positionRef.current = place(event.clientX - drag.dx, event.clientY - drag.dy) ?? null;
      }}
      onPointerUp={event => {
        if (dragRef.current?.id !== event.pointerId) return;
        dragRef.current = null;
        delete event.currentTarget.dataset.dragging;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={event => {
        dragRef.current = null;
        delete event.currentTarget.dataset.dragging;
      }}
      onLostPointerCapture={event => {
        dragRef.current = null;
        delete event.currentTarget.dataset.dragging;
      }}
      onClick={event => event.stopPropagation()}
      onKeyDown={event => {
        const directions: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
        const direction = directions[event.key];
        if (!direction) return;
        event.preventDefault();
        event.stopPropagation();
        const bounds = event.currentTarget.getBoundingClientRect();
        positionRef.current = place(bounds.left + direction[0] * 16, bounds.top + direction[1] * 16) ?? null;
      }}
    >
      {/* Preserve the original animated WebP. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/techno-dancer.webp" alt="" draggable={false} />
    </button>
  );
}
