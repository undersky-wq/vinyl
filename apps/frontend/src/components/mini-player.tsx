'use client';

import { useRouter } from 'next/navigation';
import {
  ChevronDown,
  ListOrdered,
  Pause,
  Play,
  Repeat2,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { getReleaseTimelineComments } from '../lib/api';
import { SiteLang } from '../lib/language';
import { useResponsiveWaveform } from '../lib/waveform';
import { usePlayer } from '../providers/player-provider';
import { TimelineComment } from '../types';
import { CoverImage } from './cover-image';
import { FavoriteButton, TrackPlaylistMenu } from './track-actions';
import { getNearestTimelineComment, TimelineCommentMarkers } from './timeline-comment-markers';

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

function fallbackWaveform(points = 90) {
  return Array.from({ length: points }, (_, index) => 0.25 + ((index * 37) % 70) / 100);
}

export function MiniPlayer({ lang }: MiniPlayerProps) {
  const router = useRouter();
  const {
    currentTrack,
    queue,
    displayQueue,
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
    playQueue,
    seekToPercent,
    setVolume,
    toggleShuffle,
    toggleRepeat,
    togglePlayback,
  } = usePlayer();
  const [dragProgress, setDragProgress] = useState<number | null>(null);
  const [isQueueOpen, setIsQueueOpen] = useState(false);
  const [isFullPlayerOpen, setIsFullPlayerOpen] = useState(false);
  const [overlayDragProgress, setOverlayDragProgress] = useState<number | null>(null);
  const [isOverlayQueueOpen, setIsOverlayQueueOpen] = useState(false);
  const [overlayQueueDragY, setOverlayQueueDragY] = useState(0);
  const [trackDirection, setTrackDirection] = useState<'next' | 'previous'>('next');
  const [overlayShuffleActive, setOverlayShuffleActive] = useState(isShuffleEnabled);
  const [overlayRepeatActive, setOverlayRepeatActive] = useState(isRepeatEnabled);
  const [comments, setComments] = useState<TimelineComment[]>([]);
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
  const lastHapticStepRef = useRef(-1);
  const overlayQueueDragStartYRef = useRef<number | null>(null);
  const overlayQueueDragYRef = useRef(0);
  const overlayQueueDidDragRef = useRef(false);

  const volumeLabel = lang === 'ru' ? 'Громкость' : 'Volume';
  const displayProgress = dragProgress ?? progress;
  const overlayProgress = overlayDragProgress ?? progress;
  const visibleQueue = displayQueue.length ? displayQueue : queue;
  const displayTime =
    dragProgress !== null && duration > 0 ? (duration * dragProgress) / 100 : currentTime;
  const overlaySourcePeaks = currentTrack?.waveformData?.length ? currentTrack.waveformData : fallbackWaveform();
  const { ref: overlayWaveformRef, peaks: overlayPeaks } = useResponsiveWaveform(overlaySourcePeaks, {
    minBars: 48,
    maxBars: 90,
    pixelsPerBar: 5,
  });

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

  useEffect(() => {
    if (!isFullPlayerOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isFullPlayerOpen]);

  useEffect(() => {
    setOverlayShuffleActive(isShuffleEnabled);
  }, [isShuffleEnabled]);

  useEffect(() => {
    setOverlayRepeatActive(isRepeatEnabled);
  }, [isRepeatEnabled]);

  function openFullPlayer() {
    if (typeof window === 'undefined') {
      router.push('/player');
      return;
    }

    const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    const playerUrl = `/player?from=${encodeURIComponent(returnTo)}`;

    if (window.matchMedia('(max-width: 640px)').matches) {
      setIsFullPlayerOpen(true);
      return;
    }

    router.push(playerUrl);
  }

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

  function handlePreviousTrack() {
    setTrackDirection('previous');
    playPrevious();
  }

  function handleNextTrack() {
    setTrackDirection('next');
    playNext();
  }

  function handleOverlayShuffle(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    setOverlayShuffleActive((current) => !current);
    toggleShuffle();
  }

  function handleOverlayRepeat(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    setOverlayRepeatActive((current) => !current);
    toggleRepeat();
  }

  function startOverlayQueueDrag(clientY: number) {
    overlayQueueDragStartYRef.current = clientY;
    overlayQueueDragYRef.current = 0;
    overlayQueueDidDragRef.current = false;
    setOverlayQueueDragY(0);
  }

  function moveOverlayQueueDrag(clientY: number) {
    if (overlayQueueDragStartYRef.current === null) {
      return;
    }

    const nextDragY = Math.max(0, clientY - overlayQueueDragStartYRef.current);
    overlayQueueDragYRef.current = nextDragY;
    overlayQueueDidDragRef.current = nextDragY > 6;
    setOverlayQueueDragY(nextDragY);
  }

  function finishOverlayQueueDrag() {
    if (overlayQueueDragStartYRef.current === null) {
      return;
    }

    const shouldClose = overlayQueueDragYRef.current > 44;
    overlayQueueDragStartYRef.current = null;
    overlayQueueDragYRef.current = 0;
    setOverlayQueueDragY(0);

    if (shouldClose) {
      setIsOverlayQueueOpen(false);
    }
  }

  if (!currentTrack) {
    return null;
  }

  return (
    <>
    <div
      className={`mini-player${isFullPlayerOpen ? ' mini-player--hidden' : ''}`}
      role="button"
      tabIndex={0}
      onClick={openFullPlayer}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openFullPlayer();
        }
      }}
    >
      <div className="mini-player__track">
        <CoverImage src={currentTrack.coverUrl} alt={currentTrack.title} width={58} height={58} loading="eager" />
        <div className="mini-player__meta">
          <div className="mini-player__title">{currentTrack.title}</div>
          <div className="mini-player__artist">{currentTrack.artist}</div>
        </div>
      </div>

      <div className="mini-player__controls">
        <button
          type="button"
          className={`player-icon-button ghost${isShuffleEnabled ? ' active' : ''}`}
          onClick={(event) => {
            event.stopPropagation();
            toggleShuffle();
          }}
          aria-label={lang === 'ru' ? 'Смешивание' : 'Shuffle'}
          data-tooltip={lang === 'ru' ? 'Смешивание' : 'Shuffle'}
        >
          <Shuffle size={17} />
        </button>
        <button
          type="button"
          className="player-icon-button"
          onClick={(event) => {
            event.stopPropagation();
            playPrevious();
          }}
          disabled={!canPlayPrevious}
          aria-label={lang === 'ru' ? 'Предыдущий трек' : 'Previous track'}
          data-tooltip={lang === 'ru' ? 'Предыдущий трек' : 'Previous track'}
        >
          <SkipBack size={20} fill="currentColor" />
        </button>
        <button
          type="button"
          className="player-main-button"
          style={{ '--player-progress': `${displayProgress}%` } as React.CSSProperties}
          onClick={(event) => {
            event.stopPropagation();
            togglePlayback();
          }}
          aria-label={isPlaying ? (lang === 'ru' ? 'Пауза' : 'Pause') : 'Play'}
          data-tooltip={isPlaying ? (lang === 'ru' ? 'Пауза' : 'Pause') : 'Play'}
        >
          {isPlaying ? <Pause size={24} /> : <Play size={24} fill="currentColor" />}
        </button>
        <button
          type="button"
          className="player-icon-button"
          onClick={(event) => {
            event.stopPropagation();
            playNext();
          }}
          disabled={!canPlayNext}
          aria-label={lang === 'ru' ? 'Следующий трек' : 'Next track'}
          data-tooltip={lang === 'ru' ? 'Следующий трек' : 'Next track'}
        >
          <SkipForward size={20} fill="currentColor" />
        </button>
        <button
          type="button"
          className={`player-icon-button ghost${isRepeatEnabled ? ' active' : ''}`}
          onClick={(event) => {
            event.stopPropagation();
            toggleRepeat();
          }}
          aria-label={lang === 'ru' ? 'Повтор' : 'Repeat'}
          data-tooltip={lang === 'ru' ? 'Повтор' : 'Repeat'}
        >
          <Repeat2 size={17} />
        </button>
      </div>

      <div className="mini-player__mobile-favorite" onClick={(event) => event.stopPropagation()}>
        <FavoriteButton trackId={currentTrack.id} lang={lang} alwaysVisible />
      </div>

      <div className="mini-player__timeline" onClick={(event) => event.stopPropagation()}>
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

      <div className="mini-player__track-actions" onClick={(event) => event.stopPropagation()}>
        <FavoriteButton trackId={currentTrack.id} lang={lang} alwaysVisible />
        <div className="player-queue-menu">
          <button
            type="button"
            className={`track-playlist-menu__trigger player-queue-menu__trigger${isQueueOpen ? ' active' : ''}`}
            aria-label={lang === 'ru' ? 'Очередь треков' : 'Track queue'}
            data-tooltip={lang === 'ru' ? 'Очередь' : 'Queue'}
            onClick={() => setIsQueueOpen((current) => !current)}
          >
            <ListOrdered size={18} />
          </button>

          {isQueueOpen ? (
            <div className="player-queue-menu__popup">
              <div className="player-queue-menu__title">
                {lang === 'ru' ? 'Сейчас играет' : 'Now playing'}
              </div>
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
                    <CoverImage src={track.coverUrl} alt="" width={34} height={34} />
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

      <div className="mini-player__volume" onClick={(event) => event.stopPropagation()}>
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
          data-tooltip={volumeLabel}
          onClick={() => setVolume(volume <= 0.01 ? 0.8 : 0)}
        >
          {volume <= 0.01 ? <VolumeX size={18} /> : <Volume2 size={18} />}
        </button>
      </div>
    </div>
    {isFullPlayerOpen ? (
      <div className="mobile-player-overlay" role="dialog" aria-modal="true">
        <section className={`player-page mobile-player-overlay__panel opening${!isPlaying ? ' is-paused' : ''}`}>
          <button
            type="button"
            className="player-page__collapse mobile-player-overlay__collapse"
            onClick={() => setIsFullPlayerOpen(false)}
            aria-label={lang === 'ru' ? 'Свернуть плеер' : 'Collapse player'}
            data-tooltip={lang === 'ru' ? 'Свернуть плеер' : 'Collapse player'}
          >
            <ChevronDown size={19} />
          </button>

          <button
            type="button"
            className={`player-page__cover-frame player-page__cover-button slide-${trackDirection}`}
            key={`mobile-cover-${currentTrack.id}`}
            onClick={() => {
              if (!currentTrack.releaseId) {
                return;
              }

              setIsFullPlayerOpen(false);
              router.push(`/releases/${currentTrack.releaseId}`);
            }}
            disabled={!currentTrack.releaseId}
            aria-label={currentTrack.releaseId ? `${currentTrack.artist} - ${currentTrack.title}` : currentTrack.title}
          >
            <CoverImage src={currentTrack.coverUrl} alt={currentTrack.title} width={420} height={420} loading="eager" />
          </button>
          <div className={`player-page__meta slide-${trackDirection}`} key={`mobile-meta-${currentTrack.id}`}>
            <p>{currentTrack.artist}</p>
            <h1>{currentTrack.title}</h1>
          </div>

          <div className={`player-page__timeline slide-${trackDirection}`} key={`mobile-timeline-${currentTrack.id}`}>
            <span>{formatTime(currentTime)}</span>
            <button
              type="button"
              ref={overlayWaveformRef}
              className={`player-page__waveform${overlayDragProgress !== null ? ' dragging' : ''}`}
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId);
                const nextProgress = getPointerProgress(event);
                setOverlayDragProgress(nextProgress);
                previewTimelineComment(nextProgress);
                vibrateOnStep(nextProgress);
              }}
              onPointerMove={(event) => {
                if (overlayDragProgress === null) {
                  return;
                }

                const nextProgress = getPointerProgress(event);
                setOverlayDragProgress(nextProgress);
                previewTimelineComment(nextProgress);
                vibrateOnStep(nextProgress);
              }}
              onPointerUp={(event) => {
                const nextProgress = getPointerProgress(event);
                seekToPercent(nextProgress);
                setOverlayDragProgress(null);
                setActiveCommentId(null);
                lastHapticStepRef.current = -1;
                event.currentTarget.releasePointerCapture(event.pointerId);
              }}
              onPointerCancel={() => {
                setOverlayDragProgress(null);
                setActiveCommentId(null);
                lastHapticStepRef.current = -1;
              }}
              aria-label={lang === 'ru' ? 'Перемотка трека' : 'Seek track'}
            >
              {overlayPeaks.map((peak, index) => (
                <span
                  className={(index / Math.max(overlayPeaks.length - 1, 1)) * 100 <= overlayProgress ? 'active' : ''}
                  key={`mobile-${currentTrack.id}-${index}`}
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
              className={`player-page__control player-page__control--shuffle${overlayShuffleActive ? ' active' : ''}`}
              onClick={handleOverlayShuffle}
              aria-label={lang === 'ru' ? 'Перемешивание' : 'Shuffle'}
              data-tooltip={lang === 'ru' ? 'Перемешивание' : 'Shuffle'}
            >
              <Shuffle size={22} />
            </button>
            <button
              type="button"
              className="player-page__control player-page__control--previous"
              onClick={handlePreviousTrack}
              disabled={!canPlayPrevious}
              aria-label={lang === 'ru' ? 'Предыдущий трек' : 'Previous track'}
              data-tooltip={lang === 'ru' ? 'Предыдущий трек' : 'Previous track'}
            >
              <SkipBack size={26} fill="currentColor" />
            </button>
            <button
              type="button"
              className="player-page__play"
              onClick={togglePlayback}
              aria-label={isPlaying ? (lang === 'ru' ? 'Пауза' : 'Pause') : 'Play'}
              data-tooltip={isPlaying ? (lang === 'ru' ? 'Пауза' : 'Pause') : 'Play'}
            >
              {isPlaying ? <Pause size={34} /> : <Play size={34} fill="currentColor" />}
            </button>
            <button
              type="button"
              className="player-page__control player-page__control--next"
              onClick={handleNextTrack}
              disabled={!canPlayNext}
              aria-label={lang === 'ru' ? 'Следующий трек' : 'Next track'}
              data-tooltip={lang === 'ru' ? 'Следующий трек' : 'Next track'}
            >
              <SkipForward size={26} fill="currentColor" />
            </button>
            <button
              type="button"
              className={`player-page__control player-page__control--repeat${overlayRepeatActive ? ' active' : ''}`}
              onClick={handleOverlayRepeat}
              aria-label={lang === 'ru' ? 'Повтор' : 'Repeat'}
              data-tooltip={lang === 'ru' ? 'Повтор' : 'Repeat'}
            >
              <Repeat2 size={22} />
            </button>
          </div>

          <div className="player-page__secondary-actions">
            <FavoriteButton trackId={currentTrack.id} lang={lang} alwaysVisible />
            <TrackPlaylistMenu
              trackId={currentTrack.id}
              lang={lang}
              className="player-page__playlist-add"
              align="up"
              sheetDrag
            />
            <div className="player-queue-menu player-page__queue">
              <button
                type="button"
                className={`track-playlist-menu__trigger player-queue-menu__trigger${isOverlayQueueOpen ? ' active' : ''}`}
                aria-label={lang === 'ru' ? 'Очередь треков' : 'Track queue'}
                data-tooltip={lang === 'ru' ? 'Очередь' : 'Queue'}
                onClick={() => setIsOverlayQueueOpen((current) => !current)}
              >
                <ListOrdered size={18} />
              </button>
              {isOverlayQueueOpen ? (
                <div
                  className={`player-queue-menu__popup${overlayQueueDragY > 0 ? ' dragging' : ''}`}
                  style={{ transform: overlayQueueDragY ? `translateY(${overlayQueueDragY}px)` : undefined }}
                  onClickCapture={(event) => {
                    if (overlayQueueDidDragRef.current) {
                      event.preventDefault();
                      event.stopPropagation();
                      overlayQueueDidDragRef.current = false;
                    }
                  }}
                  onPointerDown={(event) => {
                    startOverlayQueueDrag(event.clientY);
                    event.currentTarget.setPointerCapture(event.pointerId);
                  }}
                  onPointerMove={(event) => moveOverlayQueueDrag(event.clientY)}
                  onPointerUp={(event) => {
                    event.currentTarget.releasePointerCapture(event.pointerId);
                    finishOverlayQueueDrag();
                  }}
                  onPointerCancel={finishOverlayQueueDrag}
                >
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
                            setIsOverlayQueueOpen(false);
                          }}
                        >
                          <CoverImage src={track.coverUrl} alt="" width={34} height={34} />
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
      </div>
    ) : null}
    </>
  );
}
