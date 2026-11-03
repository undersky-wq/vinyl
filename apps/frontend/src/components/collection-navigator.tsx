'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Play } from 'lucide-react';
import { CoverImage } from './cover-image';
import { clampNavigator, navigatorIndex, releaseScrollTop } from '../lib/collection-navigator';
import './collection-navigator.css';

type NavigatorRelease = { id: string; artist: string; title: string; cover: string };
type NavigatorTransport = {
  read: () => { progress: number; index: number; maximum: number };
  seek: (progress: number, smooth: boolean) => void;
};

export function CollectionNavigator({ releases, positions, getScroller, top, bottom, right, playingReleaseId, playing, ru, onRevealOutside, transport }: {
  releases: NavigatorRelease[];
  positions: number[];
  getScroller: () => HTMLElement | null;
  top: number;
  bottom: number;
  right?: number;
  playingReleaseId?: string;
  playing: boolean;
  ru: boolean;
  onRevealOutside: () => void;
  transport?: NavigatorTransport;
}) {
  const rail = useRef<HTMLDivElement>(null);
  const getScrollerRef = useRef(getScroller);
  getScrollerRef.current = getScroller;
  const transportRef = useRef(transport);
  transportRef.current = transport;
  const customTransport = Boolean(transport);
  const [position, setPosition] = useState({ progress: 0, index: 0, maximum: 0 });
  const [dragging, setDragging] = useState(false);
  const [visible, setVisible] = useState(false);
  const pointer = useRef<number | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wake = () => {
    setVisible(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setVisible(false), 1600);
  };
  useEffect(() => {
    if (customTransport) {
      let previous = transportRef.current!.read();
      setPosition(previous);
      const timer = window.setInterval(() => {
        const next = transportRef.current?.read();
        if (!next || (next.progress === previous.progress && next.index === previous.index && next.maximum === previous.maximum)) return;
        previous = next;
        setPosition(next); wake();
      }, 80);
      return () => window.clearInterval(timer);
    }
    const scroller = getScrollerRef.current();
    if (!scroller) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const maximum = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
      setPosition({ maximum, progress: maximum ? clampNavigator(scroller.scrollTop / maximum) : 0,
        index: navigatorIndex(positions, scroller.scrollTop, top, maximum) });
    };
    const onScroll = () => { wake(); if (!frame) frame = requestAnimationFrame(update); };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(scroller);
    scroller.addEventListener('scroll', onScroll, { passive: true });
    return () => { observer.disconnect(); scroller.removeEventListener('scroll', onScroll); cancelAnimationFrame(frame); };
  }, [positions, top, customTransport]);
  useEffect(() => () => { if (hideTimer.current) clearTimeout(hideTimer.current); }, []);

  const seek = (progress: number) => {
    if (transportRef.current) {
      transportRef.current.seek(clampNavigator(progress), false);
      setPosition(transportRef.current.read()); wake();
      return;
    }
    const scroller = getScrollerRef.current();
    if (!scroller) return;
    scroller.scrollTo({ top: clampNavigator(progress) * Math.max(0, scroller.scrollHeight - scroller.clientHeight), behavior: 'instant' });
    wake();
  };
  const fromPointer = (clientY: number) => {
    const bounds = rail.current?.getBoundingClientRect();
    if (bounds) seek((clientY - bounds.top) / Math.max(1, bounds.height));
  };
  const stop = () => { pointer.current = null; setDragging(false); wake(); };
  const playingIndex = releases.findIndex(release => release.id === playingReleaseId);
  const playingProgress = position.maximum ? (customTransport ? (positions[playingIndex] || 0) : releaseScrollTop(positions, playingIndex, top, position.maximum)) / position.maximum : 0;
  const preview = releases[position.index];
  if (!releases.length || position.maximum <= 0) return null;
  return <nav className={`collection-navigator${visible || dragging ? ' is-visible' : ''}${dragging ? ' is-dragging' : ''}`}
    style={{ top: top + 10, bottom: bottom + 12, right } as CSSProperties}
    aria-label={ru ? 'Быстрый переход по коллекции' : 'Quick collection navigation'}>
    <div className="collection-navigator__rail" ref={rail}>
      <div className="collection-navigator__seek" role="slider" tabIndex={0} aria-orientation="vertical"
        aria-label={ru ? 'Место в коллекции' : 'Collection position'} aria-valuemin={1} aria-valuemax={releases.length}
        aria-valuenow={position.index + 1} aria-valuetext={`${position.index + 1} / ${releases.length}: ${preview?.artist} — ${preview?.title}`}
        onPointerDown={event => {
          if (event.button !== 0) return;
          event.preventDefault(); event.stopPropagation();
          pointer.current = event.pointerId;
          event.currentTarget.setPointerCapture(event.pointerId);
          event.currentTarget.focus(); setDragging(true); fromPointer(event.clientY);
        }}
        onPointerMove={event => { if (pointer.current === event.pointerId) { event.stopPropagation(); fromPointer(event.clientY); } }}
        onPointerUp={event => { if (pointer.current === event.pointerId) stop(); }}
        onPointerCancel={stop} onLostPointerCapture={() => {if (pointer.current !== null) stop();}}
        onKeyDown={event => {
          const scroller = getScrollerRef.current();
          if (!scroller && !transportRef.current) return;
          const steps: Record<string, number> = { ArrowDown: .02, ArrowUp: -.02, PageDown: .15, PageUp: -.15 };
          if (event.key === 'Home' || event.key === 'End' || event.key in steps) {
            event.preventDefault(); seek(event.key === 'Home' ? 0 : event.key === 'End' ? 1 : position.progress + steps[event.key]);
          }
        }}>
        <span className="collection-navigator__thumb" style={{ top: `${position.progress * 100}%` }} />
      </div>
      {playingIndex >= 0 && <button type="button" className={`collection-navigator__playing${playing ? ' is-playing' : ''}`}
        style={{ top: `${playingProgress * 100}%` }}
        aria-label={`${ru ? 'К играющему релизу' : 'Go to playing release'}: ${releases[playingIndex].artist} — ${releases[playingIndex].title}`}
        onClick={() => {
          if (transportRef.current) transportRef.current.seek(playingProgress, true);
          else getScrollerRef.current()?.scrollTo({top:releaseScrollTop(positions, playingIndex, top, position.maximum),behavior:'smooth'});
          wake();
        }}>
        <Play size={11} fill="currentColor" aria-hidden="true" />
        <span className="collection-navigator__playing-label" style={playingProgress > .8 ? { bottom: 0 } : { top: 0 }}>
          <CoverImage src={releases[playingIndex].cover} alt="" width={56} height={56} loading="eager" />
          <span className="collection-navigator__playing-meta">
            <small>{ru ? 'Играющий релиз' : 'Playing release'} · {playingIndex + 1} / {releases.length}</small>
            <strong>{releases[playingIndex].artist}</strong>
            <span>{releases[playingIndex].title}</span>
            <small className="collection-navigator__playing-action">{ru ? 'Перейти к релизу' : 'Go to release'} →</small>
          </span>
        </span>
      </button>}
    </div>
  </nav>;
}
