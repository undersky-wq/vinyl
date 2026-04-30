'use client';

import Image from 'next/image';
import { Pause, Play } from 'lucide-react';
import { SiteLang } from '../lib/language';
import { usePlayerActions, usePlayerProgress, usePlayerTransport } from '../providers/player-provider';

function formatTime(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return '0:00';
  }

  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60);
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function PlayerPageClient({ lang }: { lang: SiteLang }) {
  const { currentTrack, isPlaying } = usePlayerTransport();
  const { currentTime, duration, progress } = usePlayerProgress();
  const { togglePlayback, seekToPercent } = usePlayerActions();

  if (!currentTrack) {
    return (
      <section className="player-page">
        <p className="muted">{lang === 'ru' ? 'Сначала включи любой трек.' : 'Play any track first.'}</p>
      </section>
    );
  }

  return (
    <section className="player-page">
      <Image src={currentTrack.coverUrl} alt={currentTrack.title} width={420} height={420} />
      <div className="player-page__meta">
        <p>{currentTrack.artist}</p>
        <h1>{currentTrack.title}</h1>
      </div>
      <button type="button" className="player-page__play" onClick={togglePlayback}>
        {isPlaying ? <Pause size={34} /> : <Play size={34} fill="currentColor" />}
      </button>
      <div className="player-page__timeline">
        <span>{formatTime(currentTime)}</span>
        <input
          type="range"
          min={0}
          max={100}
          step={0.1}
          value={Number.isFinite(progress) ? progress : 0}
          onChange={(event) => seekToPercent(Number(event.currentTarget.value))}
          aria-label={lang === 'ru' ? 'Перемотка трека' : 'Seek track'}
        />
        <span>{formatTime(duration)}</span>
      </div>
    </section>
  );
}
