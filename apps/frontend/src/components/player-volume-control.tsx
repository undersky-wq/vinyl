'use client';

import { useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { usePlayerActions, usePlayerTransport } from '../providers/player-provider';
import type { SiteLang } from '../lib/language';
import './player-volume-control.css';

export function PlayerVolumeControl({ lang, compact = false }: { lang: SiteLang; compact?: boolean }) {
  const { volume } = usePlayerTransport();
  const { setVolume } = usePlayerActions();
  const [open, setOpen] = useState(false);
  const dragging = useRef(false);
  const dismissed = useRef(false);
  const previousVolume = useRef(.8);
  const label = lang === 'ru' ? 'Громкость' : 'Volume';
  const muted = volume <= .01;
  const toggleMute = () => {
    if (!muted) previousVolume.current = volume;
    setVolume(muted ? previousVolume.current : 0);
  };
  const slider = <input type="range" min={0} max={100} step={1}
    value={Math.round(volume * 100)} aria-label={label}
    aria-orientation="vertical" tabIndex={open ? 0 : -1}
    style={{ '--volume-level': `${volume * 100}%` } as CSSProperties}
    onPointerDown={event => { dragging.current = true; event.currentTarget.setPointerCapture(event.pointerId); }}
    onPointerUp={() => { dragging.current = false; dismissed.current = true; setOpen(false); }}
    onPointerCancel={() => { dragging.current = false; setOpen(false); }}
    onLostPointerCapture={() => { if (dragging.current) { dragging.current = false; setOpen(false); } }}
    onChange={event => setVolume(Number(event.currentTarget.value) / 100)} />;
  return <div className={`shelf-volume${compact ? ' shelf-volume--compact' : ''}`}
    onPointerEnter={() => { if (!dismissed.current) setOpen(true); }}
    onPointerLeave={() => { dismissed.current = false; if (!dragging.current) setOpen(false); }}
    onClick={event => event.stopPropagation()}
    onKeyDown={event => { if (event.key === 'Escape') setOpen(false); }}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <button type="button" className="shelf-volume__button" aria-label={compact ? label : lang === 'ru' ? (muted ? 'Включить звук' : 'Выключить звук') : (muted ? 'Unmute' : 'Mute')}
      aria-expanded={open} onFocus={() => { if (!dismissed.current) setOpen(true); }}
      onClick={compact ? () => { dismissed.current = false; setOpen(true); } : toggleMute}>
      {muted ? <VolumeX size={compact ? 17 : 26} /> : <Volume2 size={compact ? 17 : 26} />}
    </button>
    <div className={`shelf-volume__popover${open ? ' is-open' : ''}`} aria-hidden={!open}>
      {slider}
    </div>
  </div>;
}
