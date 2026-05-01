'use client';

import Image from 'next/image';
import { ListMusic, Pause, Play, Repeat2, Shuffle, SkipBack, SkipForward } from 'lucide-react';
import { useRef, useState } from 'react';
import { SiteLang } from '../lib/language';
import { usePlayerActions, usePlayerProgress, usePlayerTransport } from '../providers/player-provider';
import { FavoriteButton } from './track-actions';

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
    queue,
    displayQueue,
    isPlaying,
    isShuffleEnabled,
    isRepeatEnabled,
    canPlayPrevious,
    canPlayNext,
  } = usePlayerTransport();
  const { currentTime, duration, progress } = usePlayerProgress();
  const { playQueue, playPrevious, playNext, togglePlayback, seekToPercent, toggleShuffle, toggleRepeat } =
    usePlayerActions();
  const [dragProgress, setDragProgress] = useState<number | null>(null);
  const [isQueueOpen, setIsQueueOpen] = useState(false);
  const lastHapticStepRef = useRef(-1);

  if (!currentTrack) {
    return (
      <section className="player-page">
        <p className="muted">{lang === 'ru' ? 'Сначала включи любой трек.' : 'Play any track first.'}</p>
      </section>
    );
  }

  const peaks = (currentTrack.waveformData?.length ? currentTrack.waveformData : fallbackWaveform()).slice(0, 160);
  const displayedProgress = dragProgress ?? progress;
  const visibleQueue = displayQueue.length ? displayQueue : queue;

  function getPointerProgress(event: React.PointerEvent<HTMLButtonElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const nextProgress = ((event.clientX - rect.left) / rect.width) * 100;
    return Math.max(0, Math.min(nextProgress, 100));
  }

  function vibrateOnStep(nextProgress: number) {
    const step = Math.round(nextProgress / 5);
    if (step === lastHapticStepRef.current) {
      return;
    }

    lastHapticStepRef.current = step;
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(4);
    }
  }

  return (
    <section className="player-page">
      <Image src={currentTrack.coverUrl} alt={currentTrack.title} width={420} height={420} />
      <div className="player-page__meta">
        <p>{currentTrack.artist}</p>
        <h1>{currentTrack.title}</h1>
      </div>

      <div className="player-page__timeline">
        <span>{formatTime(currentTime)}</span>
        <button
          type="button"
          className={`player-page__waveform${dragProgress !== null ? ' dragging' : ''}`}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            const nextProgress = getPointerProgress(event);
            setDragProgress(nextProgress);
            vibrateOnStep(nextProgress);
          }}
          onPointerMove={(event) => {
            if (dragProgress === null) {
              return;
            }

            const nextProgress = getPointerProgress(event);
            setDragProgress(nextProgress);
            vibrateOnStep(nextProgress);
          }}
          onPointerUp={(event) => {
            const nextProgress = getPointerProgress(event);
            seekToPercent(nextProgress);
            setDragProgress(null);
            lastHapticStepRef.current = -1;
            event.currentTarget.releasePointerCapture(event.pointerId);
          }}
          onPointerCancel={() => {
            setDragProgress(null);
            lastHapticStepRef.current = -1;
          }}
          aria-label={lang === 'ru' ? 'Перемотка трека' : 'Seek track'}
        >
          {peaks.map((peak, index) => (
            <span
              className={(index / Math.max(peaks.length - 1, 1)) * 100 <= displayedProgress ? 'active' : ''}
              key={`${currentTrack.id}-${index}`}
              style={{ height: `${Math.max(10, Math.round(peak * 100))}%` }}
            />
          ))}
        </button>
        <span>{formatTime(duration)}</span>
      </div>

      <div className="player-page__controls">
        <button
          type="button"
          className={`player-page__control${isShuffleEnabled ? ' active' : ''}`}
          onClick={toggleShuffle}
          aria-label={lang === 'ru' ? 'Перемешивание' : 'Shuffle'}
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

      <div className="player-page__secondary-actions">
        <FavoriteButton trackId={currentTrack.id} lang={lang} alwaysVisible />
        <div className="player-queue-menu player-page__queue">
          <button
            type="button"
            className={`track-playlist-menu__trigger player-queue-menu__trigger${isQueueOpen ? ' active' : ''}`}
            aria-label={lang === 'ru' ? 'Очередь треков' : 'Track queue'}
            title={lang === 'ru' ? 'Очередь треков' : 'Track queue'}
            onClick={() => setIsQueueOpen((current) => !current)}
          >
            <ListMusic size={18} />
          </button>

          {isQueueOpen ? (
            <div className="player-queue-menu__popup">
              <div className="player-queue-menu__title">{lang === 'ru' ? 'Сейчас играет' : 'Now playing'}</div>
              <div className="player-queue-menu__list">
                {visibleQueue.map((track) => {
                  const queueIndex = queue.findIndex((item) => item.id === track.id);
                  const isActive = track.id === currentTrack.id;

                  return (
                    <button
                      type="button"
                      className={`player-queue-menu__item${isActive ? ' active' : ''}`}
                      key={track.id}
                      onClick={() => {
                        if (queueIndex >= 0) {
                          playQueue(queue, queueIndex, visibleQueue);
                        }
                        setIsQueueOpen(false);
                      }}
                    >
                      <Image src={track.coverUrl} alt="" width={34} height={34} />
                      <span>
                        <strong>{track.title}</strong>
                        <em>{track.artist}</em>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
