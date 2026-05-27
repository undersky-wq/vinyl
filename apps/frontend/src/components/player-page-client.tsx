'use client';

import Image from 'next/image';
import { ChevronDown, ListOrdered, Pause, Play, Repeat2, Shuffle, SkipBack, SkipForward } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { CSSProperties } from 'react';
import { useEffect, useRef, useState } from 'react';
import { getReleaseTimelineComments } from '../lib/api';
import { SiteLang } from '../lib/language';
import { usePlayerActions, usePlayerProgress, usePlayerTransport } from '../providers/player-provider';
import { TimelineComment } from '../types';
import { FavoriteButton, TrackPlaylistMenu } from './track-actions';
import { getNearestTimelineComment, TimelineCommentMarkers } from './timeline-comment-markers';

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

function getSafeReturnPath(value: string) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) {
    return '';
  }

  return value;
}

export function PlayerPageClient({ lang, returnTo }: { lang: SiteLang; returnTo?: string }) {
  const router = useRouter();
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
  const [pageTransition, setPageTransition] = useState<'opening' | 'closing' | ''>('');
  const [trackDirection, setTrackDirection] = useState<'next' | 'previous'>('next');
  const [comments, setComments] = useState<TimelineComment[]>([]);
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
  const lastHapticStepRef = useRef(-1);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    if (window.sessionStorage.getItem('vinyl-player-transition') !== 'opening') {
      return;
    }

    setPageTransition('opening');
    window.sessionStorage.removeItem('vinyl-player-transition');
    const timeout = window.setTimeout(() => setPageTransition(''), 420);
    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (!currentTrack?.releaseId) {
      setComments([]);
      return;
    }

    let cancelled = false;
    getReleaseTimelineComments(currentTrack.releaseId)
      .then((nextComments) => {
        if (!cancelled) {
          setComments(nextComments);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setComments([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [currentTrack?.releaseId]);

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

  function previewTimelineComment(nextProgress: number) {
    const nearest = getNearestTimelineComment(comments, nextProgress, duration);
    setActiveCommentId(nearest?.id || null);
  }

  function collapsePlayer() {
    const navigateBack = () => {
      const safeReturnTo = getSafeReturnPath(returnTo || '');
      if (safeReturnTo) {
        router.replace(safeReturnTo);
        return;
      }

      if (typeof window !== 'undefined' && window.history.length > 1) {
        router.back();
        return;
      }

      router.push('/');
    };

    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches) {
      setPageTransition('closing');
      window.setTimeout(navigateBack, 210);
      return;
    }

    navigateBack();
  }

  function handlePreviousTrack() {
    setTrackDirection('previous');
    playPrevious();
  }

  function handleNextTrack() {
    setTrackDirection('next');
    playNext();
  }

  return (
    <section
      className={`player-page${pageTransition ? ` ${pageTransition}` : ''}`}
      style={{ '--player-cover-bg': `url("${currentTrack.coverUrl}")` } as CSSProperties}
    >
      <button
        type="button"
        className="player-page__collapse"
        onClick={collapsePlayer}
        aria-label={lang === 'ru' ? 'Свернуть плеер' : 'Collapse player'}
        data-tooltip={lang === 'ru' ? 'Свернуть плеер' : 'Collapse player'}
      >
        <ChevronDown size={24} />
      </button>

      <button
        type="button"
        className={`player-page__cover-frame player-page__cover-button slide-${trackDirection}`}
        key={`cover-${currentTrack.id}`}
        onClick={() => {
          if (currentTrack.releaseId) {
            router.push(`/releases/${currentTrack.releaseId}`);
          }
        }}
        disabled={!currentTrack.releaseId}
        aria-label={currentTrack.releaseId ? `${currentTrack.artist} - ${currentTrack.title}` : currentTrack.title}
      >
        <Image src={currentTrack.coverUrl} alt={currentTrack.title} width={420} height={420} />
      </button>
      <div className={`player-page__meta slide-${trackDirection}`} key={`meta-${currentTrack.id}`}>
        <p>{currentTrack.artist}</p>
        <h1>{currentTrack.title}</h1>
      </div>

      <div className={`player-page__timeline slide-${trackDirection}`} key={`timeline-${currentTrack.id}`}>
        <span>{formatTime(currentTime)}</span>
        <button
          type="button"
          className={`player-page__waveform${dragProgress !== null ? ' dragging' : ''}`}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            const nextProgress = getPointerProgress(event);
            setDragProgress(nextProgress);
            previewTimelineComment(nextProgress);
            vibrateOnStep(nextProgress);
          }}
          onPointerMove={(event) => {
            if (dragProgress === null) {
              return;
            }

            const nextProgress = getPointerProgress(event);
            setDragProgress(nextProgress);
            previewTimelineComment(nextProgress);
            vibrateOnStep(nextProgress);
          }}
          onPointerUp={(event) => {
            const nextProgress = getPointerProgress(event);
            seekToPercent(nextProgress);
            setDragProgress(null);
            setActiveCommentId(null);
            lastHapticStepRef.current = -1;
            event.currentTarget.releasePointerCapture(event.pointerId);
          }}
          onPointerCancel={() => {
            setDragProgress(null);
            setActiveCommentId(null);
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
          <TimelineCommentMarkers
            comments={comments}
            durationSec={duration}
            activeCommentId={activeCommentId}
          />
        </button>
        <span>{formatTime(duration)}</span>
      </div>

      <div className="player-page__controls">
        <button
          type="button"
          className={`player-page__control player-page__control--shuffle${isShuffleEnabled ? ' active' : ''}`}
          onClick={(event) => {
            event.stopPropagation();
            toggleShuffle();
          }}
          aria-label={lang === 'ru' ? 'Перемешивание' : 'Shuffle'}
        >
          <Shuffle size={22} />
        </button>
        <button
          type="button"
          className="player-page__control player-page__control--previous"
          onClick={(event) => {
            event.stopPropagation();
            handlePreviousTrack();
          }}
          disabled={!canPlayPrevious}
          aria-label={lang === 'ru' ? 'Предыдущий трек' : 'Previous track'}
        >
          <SkipBack size={26} fill="currentColor" />
        </button>
        <button
          type="button"
          className="player-page__play"
          onClick={(event) => {
            event.stopPropagation();
            togglePlayback();
          }}
        >
          {isPlaying ? <Pause size={34} /> : <Play size={34} fill="currentColor" />}
        </button>
        <button
          type="button"
          className="player-page__control player-page__control--next"
          onClick={(event) => {
            event.stopPropagation();
            handleNextTrack();
          }}
          disabled={!canPlayNext}
          aria-label={lang === 'ru' ? 'Следующий трек' : 'Next track'}
        >
          <SkipForward size={26} fill="currentColor" />
        </button>
        <button
          type="button"
          className={`player-page__control player-page__control--repeat${isRepeatEnabled ? ' active' : ''}`}
          onClick={(event) => {
            event.stopPropagation();
            toggleRepeat();
          }}
          aria-label={lang === 'ru' ? 'Повтор' : 'Repeat'}
        >
          <Repeat2 size={22} />
        </button>
      </div>

      <div className="player-page__secondary-actions">
        <FavoriteButton trackId={currentTrack.id} lang={lang} alwaysVisible />
        <TrackPlaylistMenu trackId={currentTrack.id} lang={lang} className="player-page__playlist-add" align="up" />
        <div className="player-queue-menu player-page__queue">
          <button
            type="button"
            className={`track-playlist-menu__trigger player-queue-menu__trigger${isQueueOpen ? ' active' : ''}`}
            aria-label={lang === 'ru' ? 'Очередь треков' : 'Track queue'}
            data-tooltip="Queue"
            onClick={() => setIsQueueOpen((current) => !current)}
          >
            <ListOrdered size={18} />
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
                          const activeIndex = queue.findIndex((item) => item.id === currentTrack.id);
                          setTrackDirection(queueIndex >= activeIndex ? 'next' : 'previous');
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
