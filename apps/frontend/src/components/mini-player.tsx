'use client';

import Image from 'next/image';
import {
  Pause,
  Play,
  Repeat2,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useState } from 'react';
import { SiteLang } from '../lib/language';
import { usePlayer } from '../providers/player-provider';
import { FavoriteButton, TrackPlaylistMenu } from './track-actions';

type MiniPlayerProps = {
  lang: SiteLang;
};

function formatTime(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return '0:00';
  }

  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60);
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function MiniPlayer({ lang }: MiniPlayerProps) {
  const {
    currentTrack,
    isPlaying,
    progress,
    currentTime,
    duration,
    volume,
    isShuffleEnabled,
    isRepeatEnabled,
    canPlayPrevious,
    canPlayNext,
    playPrevious,
    playNext,
    seekToPercent,
    setVolume,
    toggleShuffle,
    toggleRepeat,
    togglePlayback,
  } = usePlayer();
  const [dragProgress, setDragProgress] = useState<number | null>(null);

  const volumeLabel = lang === 'ru' ? 'Громкость' : 'Volume';
  const displayProgress = dragProgress ?? progress;
  const displayTime =
    dragProgress !== null && duration > 0 ? (duration * dragProgress) / 100 : currentTime;

  if (!currentTrack) {
    return null;
  }

  return (
    <div className="mini-player">
      <div className="mini-player__track">
        <Image src={currentTrack.coverUrl} alt={currentTrack.title} width={58} height={58} />
        <div className="mini-player__meta">
          <div className="mini-player__title">{currentTrack.title}</div>
          <div className="mini-player__artist">{currentTrack.artist}</div>
        </div>
      </div>

      <div className="mini-player__controls">
        <button
          type="button"
          className={`player-icon-button ghost${isShuffleEnabled ? ' active' : ''}`}
          onClick={toggleShuffle}
          aria-label={lang === 'ru' ? 'Смешивание' : 'Shuffle'}
          title={lang === 'ru' ? 'Смешивание' : 'Shuffle'}
        >
          <Shuffle size={17} />
        </button>
        <button
          type="button"
          className="player-icon-button"
          onClick={playPrevious}
          disabled={!canPlayPrevious}
          aria-label={lang === 'ru' ? 'Предыдущий трек' : 'Previous track'}
          title={lang === 'ru' ? 'Предыдущий трек' : 'Previous track'}
        >
          <SkipBack size={20} fill="currentColor" />
        </button>
        <button
          type="button"
          className="player-main-button"
          onClick={togglePlayback}
          aria-label={isPlaying ? (lang === 'ru' ? 'Пауза' : 'Pause') : 'Play'}
          title={isPlaying ? (lang === 'ru' ? 'Пауза' : 'Pause') : 'Play'}
        >
          {isPlaying ? <Pause size={24} /> : <Play size={24} fill="currentColor" />}
        </button>
        <button
          type="button"
          className="player-icon-button"
          onClick={playNext}
          disabled={!canPlayNext}
          aria-label={lang === 'ru' ? 'Следующий трек' : 'Next track'}
          title={lang === 'ru' ? 'Следующий трек' : 'Next track'}
        >
          <SkipForward size={20} fill="currentColor" />
        </button>
        <button
          type="button"
          className={`player-icon-button ghost${isRepeatEnabled ? ' active' : ''}`}
          onClick={toggleRepeat}
          aria-label={lang === 'ru' ? 'Повтор' : 'Repeat'}
          title={lang === 'ru' ? 'Повтор' : 'Repeat'}
        >
          <Repeat2 size={17} />
        </button>
      </div>

      <div className="mini-player__timeline">
        <span className="mini-player__stamp muted">{formatTime(displayTime)}</span>
        <div className="seekbar">
          <div className="progress">
            <span style={{ width: `${displayProgress}%` }} />
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={0.1}
            value={Number.isFinite(displayProgress) ? displayProgress : 0}
            className="progress-slider"
            aria-label={lang === 'ru' ? 'Перемотка трека' : 'Seek track'}
            onInput={(event) => setDragProgress(Number(event.currentTarget.value))}
            onChange={(event) => {
              const nextValue = Number(event.currentTarget.value);
              seekToPercent(nextValue);
              setDragProgress(null);
            }}
          />
        </div>
        <span className="mini-player__stamp muted">{formatTime(duration)}</span>
      </div>

      <div className="mini-player__track-actions">
        <FavoriteButton trackId={currentTrack.id} lang={lang} alwaysVisible />
        <TrackPlaylistMenu trackId={currentTrack.id} lang={lang} align="up" />
      </div>

      <div className="mini-player__volume">
        <div className="volume-popover">
          <div className="volume-slider-shell">
            <div className="volume-rail">
              <span style={{ height: `${Math.round(volume * 100)}%` }} />
            </div>
            <div
              className="volume-thumb"
              style={{ bottom: `calc(${Math.round(volume * 100)}% - 8px)` }}
            />
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={Math.round(volume * 100)}
              className="volume-slider"
              aria-label={volumeLabel}
              onInput={(event) => setVolume(Number(event.currentTarget.value) / 100)}
              onChange={(event) => setVolume(Number(event.currentTarget.value) / 100)}
            />
          </div>
        </div>
        <button
          type="button"
          className="player-icon-button ghost"
          aria-label={volumeLabel}
          title={volumeLabel}
          onClick={() => setVolume(volume <= 0.01 ? 0.8 : 0)}
        >
          {volume <= 0.01 ? <VolumeX size={18} /> : <Volume2 size={18} />}
        </button>
      </div>
    </div>
  );
}
