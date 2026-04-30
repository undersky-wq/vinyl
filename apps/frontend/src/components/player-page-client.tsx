'use client';

import Image from 'next/image';
import { Pause, Play, Repeat2, Shuffle, SkipBack, SkipForward } from 'lucide-react';
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

function fallbackWaveform(points = 120) {
  return Array.from({ length: points }, (_, index) => 0.25 + ((index * 37) % 70) / 100);
}

export function PlayerPageClient({ lang }: { lang: SiteLang }) {
  const {
    currentTrack,
    isPlaying,
    isShuffleEnabled,
    isRepeatEnabled,
    canPlayPrevious,
    canPlayNext,
  } = usePlayerTransport();
  const { currentTime, duration, progress } = usePlayerProgress();
  const { playPrevious, playNext, togglePlayback, seekToPercent, toggleShuffle, toggleRepeat } =
    usePlayerActions();

  if (!currentTrack) {
    return (
      <section className="player-page">
        <p className="muted">{lang === 'ru' ? 'Сначала включи любой трек.' : 'Play any track first.'}</p>
      </section>
    );
  }

  const peaks = (currentTrack.waveformData?.length ? currentTrack.waveformData : fallbackWaveform()).slice(0, 160);

  return (
    <section className="player-page">
      <Image src={currentTrack.coverUrl} alt={currentTrack.title} width={420} height={420} />
      <div className="player-page__meta">
        <p>{currentTrack.artist}</p>
        <h1>{currentTrack.title}</h1>
      </div>

      <div className="player-page__controls">
        <button
          type="button"
          className={`player-page__control${isShuffleEnabled ? ' active' : ''}`}
          onClick={toggleShuffle}
          aria-label={lang === 'ru' ? 'Смешивание' : 'Shuffle'}
        >
          <Shuffle size={22} />
        </button>
        <button
          type="button"
          className="player-page__control"
          onClick={playPrevious}
          disabled={!canPlayPrevious}
          aria-label={lang === 'ru' ? 'Предыдущий трек' : 'Previous track'}
        >
          <SkipBack size={26} fill="currentColor" />
        </button>
        <button type="button" className="player-page__play" onClick={togglePlayback}>
          {isPlaying ? <Pause size={34} /> : <Play size={34} fill="currentColor" />}
        </button>
        <button
          type="button"
          className="player-page__control"
          onClick={playNext}
          disabled={!canPlayNext}
          aria-label={lang === 'ru' ? 'Следующий трек' : 'Next track'}
        >
          <SkipForward size={26} fill="currentColor" />
        </button>
        <button
          type="button"
          className={`player-page__control${isRepeatEnabled ? ' active' : ''}`}
          onClick={toggleRepeat}
          aria-label={lang === 'ru' ? 'Повтор' : 'Repeat'}
        >
          <Repeat2 size={22} />
        </button>
      </div>

      <div className="player-page__timeline">
        <span>{formatTime(currentTime)}</span>
        <button
          type="button"
          className="player-page__waveform"
          onClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            const nextProgress = ((event.clientX - rect.left) / rect.width) * 100;
            seekToPercent(Math.max(0, Math.min(nextProgress, 100)));
          }}
          aria-label={lang === 'ru' ? 'Перемотка трека' : 'Seek track'}
        >
          {peaks.map((peak, index) => (
            <span
              className={(index / Math.max(peaks.length - 1, 1)) * 100 <= progress ? 'active' : ''}
              key={`${currentTrack.id}-${index}`}
              style={{ height: `${Math.max(10, Math.round(peak * 100))}%` }}
            />
          ))}
        </button>
        <span>{formatTime(duration)}</span>
      </div>
    </section>
  );
}
