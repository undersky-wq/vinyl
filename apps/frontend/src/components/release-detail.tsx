'use client';

import { ImagePlus, Play, Trash2, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { deleteRelease, deleteTrackAudio, updateTrackMetadata, uploadReleaseCover } from '../lib/api';
import { SiteLang } from '../lib/language';
import { useAuth } from '../providers/auth-provider';
import { PlayerTrack, usePlayer } from '../providers/player-provider';
import { Release } from '../types';
import { CoverArtwork } from './cover-artwork';
import { FavoriteButton, TrackPlaylistMenu } from './track-actions';
import { TrackUploadButton } from './track-upload-button';

type ReleaseDetailProps = {
  lang: SiteLang;
  release: Release;
};

type ReleasePlayerTrack = PlayerTrack & {
  durationRaw: string | null;
  durationSec: number | null;
  waveformData: number[];
};

function formatTrackDuration(durationRaw?: string | null, durationSec?: number | null) {
  if (durationRaw) {
    return durationRaw;
  }

  if (!durationSec || !Number.isFinite(durationSec)) {
    return '-';
  }

  const minutes = Math.floor(durationSec / 60);
  const seconds = durationSec % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function getTrackArtist(track: { artists?: string[] }, releaseArtist: string) {
  return track.artists?.length ? track.artists.join(', ') : releaseArtist;
}

const KEY_COLORS: Record<string, string> = {
  C: '#d67adf',
  Am: '#dfb2e5',
  G: '#8a7aa3',
  Em: '#b7afc5',
  D: '#6f93c7',
  Bm: '#b6c8df',
  A: '#55b8e9',
  'F#m': '#9ad9ea',
  Gbm: '#9ad9ea',
  E: '#49d2d5',
  'C#m': '#86dddd',
  Dbm: '#86dddd',
  B: '#50c989',
  'G#m': '#97d8c0',
  Abm: '#97d8c0',
  'F#': '#73e86e',
  'D#m': '#9def98',
  Ebm: '#9def98',
  'C#': '#aee650',
  'A#m': '#cceb9b',
  Bbm: '#cceb9b',
  'G#': '#ffe75a',
  Fm: '#fff0a1',
  'D#': '#ffb85b',
  Cm: '#ffd8a1',
  'A#': '#e9484e',
  Gm: '#ef9295',
  F: '#f544a1',
  Dm: '#f28bc4',
};

function getKeyColor(key?: string | null) {
  if (!key) {
    return null;
  }

  return KEY_COLORS[key.trim()] || null;
}

function EditableTrackMeta({
  label,
  value,
  color,
  disabled,
  onSave,
}: {
  label: string;
  value?: string | number | null;
  color?: string | null;
  disabled?: boolean;
  onSave: (value: string) => Promise<void>;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(value ? String(value) : '');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isEditing) {
      setDraft(value ? String(value) : '');
    }
  }, [isEditing, value]);

  if (isEditing) {
    return (
      <input
        className="track-meta-input"
        value={draft}
        autoFocus
        disabled={isSaving}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => setIsEditing(false)}
        onKeyDown={async (event) => {
          if (event.key === 'Escape') {
            setIsEditing(false);
            return;
          }

          if (event.key !== 'Enter') {
            return;
          }

          event.preventDefault();
          setIsSaving(true);
          try {
            await onSave(draft.trim());
            setIsEditing(false);
          } finally {
            setIsSaving(false);
          }
        }}
      />
    );
  }

  return (
    <button
      type="button"
      className={`track-meta-pill${value ? ' active' : ''}`}
      style={color ? { color } : undefined}
      disabled={disabled}
      onClick={() => {
        if (!disabled) {
          setIsEditing(true);
        }
      }}
    >
      {value || label}
    </button>
  );
}

function buildFallbackWaveform(seed: string, points = 180) {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }

  return Array.from({ length: points }, (_, index) => {
    hash = (hash * 1664525 + 1013904223 + index) >>> 0;
    const value = 0.18 + ((hash % 1000) / 1000) * 0.82;
    return Number(value.toFixed(3));
  });
}

function ReleaseWaveform({
  tracks,
  currentTrackId,
  getAudioElement,
  playQueueAtPercent,
  seekToPercent,
}: {
  tracks: ReleasePlayerTrack[];
  currentTrackId?: string;
  getAudioElement: () => HTMLAudioElement | null;
  playQueueAtPercent: (tracks: PlayerTrack[], startIndex: number, percent: number) => void;
  seekToPercent: (percent: number) => void;
}) {
  const sourceTrack =
    tracks.find((track) => track.id === currentTrackId) ||
    tracks.find((track) => track.waveformData.length) ||
    tracks[0];
  const peaks = (sourceTrack?.waveformData.length
    ? sourceTrack.waveformData
    : buildFallbackWaveform(`${sourceTrack?.artist || ''}-${sourceTrack?.title || ''}`)).slice(0, 180);
  const [progressPercent, setProgressPercent] = useState(0);
  const currentTrackIndex = tracks.findIndex((track) => track.id === currentTrackId);
  const isCurrentReleasePlaying = currentTrackIndex >= 0;

  useEffect(() => {
    const audio = getAudioElement();
    if (!isCurrentReleasePlaying || !audio) {
      setProgressPercent(0);
      return;
    }

    const syncProgress = () => {
      if (!Number.isFinite(audio.duration) || audio.duration <= 0) {
        setProgressPercent(0);
        return;
      }

      setProgressPercent((audio.currentTime / audio.duration) * 100);
    };

    syncProgress();
    audio.addEventListener('timeupdate', syncProgress);
    audio.addEventListener('loadedmetadata', syncProgress);
    audio.addEventListener('seeked', syncProgress);

    return () => {
      audio.removeEventListener('timeupdate', syncProgress);
      audio.removeEventListener('loadedmetadata', syncProgress);
      audio.removeEventListener('seeked', syncProgress);
    };
  }, [currentTrackId, getAudioElement, isCurrentReleasePlaying]);

  function handleWaveSeek(event: React.MouseEvent<HTMLButtonElement>) {
    if (!tracks.length) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const percent = ((event.clientX - rect.left) / rect.width) * 100;
    const normalizedPercent = Math.max(0, Math.min(percent, 100));
    const audio = getAudioElement();

    if (isCurrentReleasePlaying && audio && Number.isFinite(audio.duration) && audio.duration > 0) {
      seekToPercent(normalizedPercent);
      return;
    }

    playQueueAtPercent(tracks, 0, normalizedPercent);
  }

  if (!tracks.length) {
    return null;
  }

  return (
    <div className="release-wave">
      <button
        type="button"
        className="library-wave__bars is-decoded release-wave__bars"
        onClick={handleWaveSeek}
        aria-label="Seek release waveform"
      >
        {peaks.map((peak, index) => (
          <span
            className={`library-wave__bar${
              (index / Math.max(peaks.length - 1, 1)) * 100 <= progressPercent ? ' is-active' : ''
            }`}
            key={`${sourceTrack?.id || 'fallback'}-${index}`}
            style={{ height: `${Math.max(8, Math.round(peak * 100))}%` }}
          />
        ))}
      </button>
      <span className="library-wave__duration">
        {formatTrackDuration(sourceTrack?.durationRaw, sourceTrack?.durationSec)}
      </span>
    </div>
  );
}

export function ReleaseDetail({ release, lang }: ReleaseDetailProps) {
  const { currentTrack, playQueue, playQueueAtPercent, seekToPercent, getAudioElement } = usePlayer();
  const { user, requireAuth } = useAuth();
  const router = useRouter();
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [deletingAudioId, setDeletingAudioId] = useState<string | null>(null);
  const [isDeletingRelease, setIsDeletingRelease] = useState(false);
  const [isUploadingCover, setIsUploadingCover] = useState(false);
  const [uploadedCoverUrl, setUploadedCoverUrl] = useState<string | null>(null);
  const coverInputRef = useRef<HTMLInputElement | null>(null);
  const [trackMetaById, setTrackMetaById] = useState(() =>
    Object.fromEntries(
      release.tracks.map((track) => [
        track.id,
        {
          bpm: track.bpm,
          key: track.key,
        },
      ]),
    ),
  );
  const coverOriginalSrc =
    uploadedCoverUrl ||
    release.coverStorageUrl ||
    release.coverImageUrl ||
    'https://placehold.co/800x800/png';
  const coverSrc =
    uploadedCoverUrl ||
    release.coverMediumStorageUrl ||
    release.coverThumbStorageUrl ||
    coverOriginalSrc;
  const hasCover = Boolean(uploadedCoverUrl || release.coverStorageUrl || release.coverImageUrl);

  const galleryImages = useMemo(
    () => [
      {
        key: 'front',
        label: lang === 'ru' ? 'Лицевая' : 'Front',
        src: coverOriginalSrc,
      },
      ...((release.images || [])
        .filter((image) => image.type === 'GALLERY')
        .map((image, index) => ({
          key: image.id,
          label:
            index === 0
              ? lang === 'ru'
                ? 'Обратная'
                : 'Back'
              : `${lang === 'ru' ? 'Изображение' : 'Image'} ${index + 2}`,
          src: image.url,
        })) || []),
    ],
    [coverOriginalSrc, lang, release.images],
  );

  const activeImage = galleryImages[activeImageIndex] || galleryImages[0];

  useEffect(() => {
    if (!isLightboxOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsLightboxOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isLightboxOpen]);

  const playableTracks: ReleasePlayerTrack[] = release.tracks
    .map((track) => {
      if (!track.audioFiles?.length) {
        return null;
      }

      const audioUrl = track.audioFiles?.find((file) => file.storageUrl)?.storageUrl || '';

      return {
        id: track.id,
        title: track.title,
        artist: getTrackArtist(track, release.artist),
        audioUrl,
        coverUrl: coverSrc,
        durationRaw: track.durationRaw ?? null,
        durationSec: track.durationSec ?? null,
        waveformData: Array.isArray(track.waveformData)
          ? track.waveformData.filter((value): value is number => typeof value === 'number')
          : [],
      };
    })
    .filter((track): track is ReleasePlayerTrack => Boolean(track));

  const meta = [release.year, release.country].filter(Boolean).join(' • ');
  const tags = [...release.styles];

  async function handleDeleteRelease() {
    const confirmed = window.confirm(
      lang === 'ru'
        ? `Удалить релиз "${release.artist} - ${release.title}"? Это также удалит его треки из плейлистов и загруженные файлы.`
        : `Delete "${release.artist} - ${release.title}"? This will also remove its playlist items and uploaded files.`,
    );

    if (!confirmed) {
      return;
    }

    setIsDeletingRelease(true);
    try {
      await deleteRelease(release.id);
      router.push('/');
      router.refresh();
    } finally {
      setIsDeletingRelease(false);
    }
  }

  async function handleCoverUpload(file: File) {
    setIsUploadingCover(true);
    try {
      const updatedRelease = await uploadReleaseCover(release.id, file);
      setUploadedCoverUrl(
        updatedRelease.coverMediumStorageUrl ||
          updatedRelease.coverThumbStorageUrl ||
          updatedRelease.coverStorageUrl ||
          updatedRelease.coverImageUrl ||
          null,
      );
      router.refresh();
    } finally {
      setIsUploadingCover(false);
    }
  }

  async function handleTrackMetaSave(trackId: string, patch: { bpm?: number | null; key?: string | null }) {
    const currentMeta = trackMetaById[trackId] || { bpm: null, key: null };
    const nextMeta = {
      ...currentMeta,
      ...patch,
    };

    setTrackMetaById((current) => ({
      ...current,
      [trackId]: nextMeta,
    }));

    const updatedTrack = await updateTrackMetadata(trackId, nextMeta);
    setTrackMetaById((current) => ({
      ...current,
      [trackId]: {
        bpm: updatedTrack.bpm,
        key: updatedTrack.key,
      },
    }));
    router.refresh();
  }

  return (
    <div className="release-page">
      <div className="release-header">
        <div className="release-cover-shell">
        <button
          type="button"
          className={`release-cover-button${!hasCover ? ' release-cover-button--empty' : ''}`}
          onClick={() => {
            if (!hasCover && user?.role === 'ADMIN') {
              coverInputRef.current?.click();
              return;
            }

            setActiveImageIndex(0);
            setIsLightboxOpen(true);
          }}
          aria-label={lang === 'ru' ? 'Открыть обложку крупно' : 'Open cover full size'}
        >
          <div className="cover-frame">
            <CoverArtwork
              src={coverSrc}
              alt={release.title}
              sizes="(max-width: 900px) 90vw, 340px"
              priority
            />
              {!hasCover && user?.role === 'ADMIN' ? (
                <span className="release-cover-empty-hint">
                  <ImagePlus size={28} />
                  {lang === 'ru' ? 'Добавить обложку' : 'Add cover'}
                </span>
              ) : null}
          </div>
        </button>

          {user?.role === 'ADMIN' ? (
            <>
              <button
                type="button"
                className="release-cover-upload"
                disabled={isUploadingCover}
                onClick={() => coverInputRef.current?.click()}
              >
                <ImagePlus size={16} />
                {isUploadingCover
                  ? lang === 'ru'
                    ? 'Загрузка...'
                    : 'Uploading...'
                  : hasCover
                    ? lang === 'ru'
                      ? 'Заменить'
                      : 'Replace'
                    : lang === 'ru'
                      ? 'Загрузить'
                      : 'Upload'}
              </button>
              <input
                ref={coverInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="release-cover-input"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) {
                    void handleCoverUpload(file);
                  }
                  event.target.value = '';
                }}
              />
            </>
          ) : null}
        </div>

        <div className="release-panel">
          <div className="release-title-row">
            <h1 className="release-heading">
              <span className="release-heading__artist">{release.artist}</span>
              <span className="release-heading__dash">—</span>
              <span className="release-heading__title">{release.title}</span>
            </h1>
            {user?.role === 'ADMIN' ? (
              <button
                type="button"
                className="track-icon-button track-icon-button--danger release-delete-button"
                aria-label={lang === 'ru' ? 'Удалить релиз' : 'Delete release'}
                disabled={isDeletingRelease}
                onClick={() => void handleDeleteRelease()}
              >
                <Trash2 size={16} />
              </button>
            ) : null}
          </div>
          {meta ? <p className="muted release-heading__meta">{meta}</p> : null}
          {tags.length ? (
            <div className="tag-list">
              {tags.map((tag) => (
                <span className="tag-pill" key={tag}>
                  {tag}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <ReleaseWaveform
        tracks={playableTracks}
        currentTrackId={currentTrack?.id}
        getAudioElement={getAudioElement}
        playQueueAtPercent={playQueueAtPercent}
        seekToPercent={seekToPercent}
      />

      <div className="release-panel">
        <div className="tracklist">
          {release.tracks.length ? (
            release.tracks.map((track) => {
              const audioFile = track.audioFiles?.[0] || null;
              const trackMeta = trackMetaById[track.id] || { bpm: track.bpm, key: track.key };

              return (
              <div className="track-row" key={track.id}>
                <div className="track-row__actions track-row__actions--leading">
                  {audioFile ? (
                    <button
                      type="button"
                      className="track-icon-button"
                      aria-label={lang === 'ru' ? 'Воспроизвести' : 'Play'}
                      onClick={() => {
                        const trackIndex = playableTracks.findIndex((item) => item.id === track.id);
                        if (trackIndex < 0) {
                          requireAuth();
                          return;
                        }

                        playQueue(playableTracks, trackIndex);
                      }}
                    >
                      <Play size={16} />
                    </button>
                  ) : user?.role === 'ADMIN' ? (
                    <TrackUploadButton trackId={track.id} lang={lang} />
                  ) : (
                    <span className="track-row__empty-action" />
                  )}
                </div>

                <div>
                  <div>
                    {track.position ? <span className="track-row__position">{track.position}</span> : null}
                    <span>{getTrackArtist(track, release.artist)} — {track.title}</span>
                  </div>
                </div>
                <div className="track-row__meta-actions">
                  <div className="track-row__meta-edit track-row__meta-edit--inline">
                    <EditableTrackMeta
                      label="BPM"
                      value={trackMeta.bpm ? `${trackMeta.bpm} BPM` : null}
                      disabled={user?.role !== 'ADMIN'}
                      onSave={async (value) => {
                        const bpm = Number(value.replace(/bpm/gi, '').trim());
                        await handleTrackMetaSave(track.id, {
                          bpm: Number.isFinite(bpm) && bpm > 0 ? bpm : null,
                        });
                      }}
                    />
                    <EditableTrackMeta
                      label="KEY"
                      value={trackMeta.key}
                      color={getKeyColor(trackMeta.key)}
                      disabled={user?.role !== 'ADMIN'}
                      onSave={async (value) => {
                        await handleTrackMetaSave(track.id, {
                          key: value || null,
                        });
                      }}
                    />
                  </div>

                  {audioFile ? (
                    <>
                      <FavoriteButton trackId={track.id} lang={lang} />
                      <TrackPlaylistMenu trackId={track.id} lang={lang} />
                    </>
                  ) : null}

                  {audioFile && user?.role === 'ADMIN' ? (
                    <button
                      type="button"
                      className="track-icon-button track-icon-button--danger"
                      aria-label={lang === 'ru' ? 'Удалить MP3' : 'Delete MP3'}
                      disabled={deletingAudioId === audioFile.id}
                      onClick={async () => {
                        setDeletingAudioId(audioFile.id);
                        try {
                          await deleteTrackAudio(audioFile.id);
                          router.refresh();
                        } finally {
                          setDeletingAudioId(null);
                        }
                      }}
                    >
                      <Trash2 size={15} />
                    </button>
                  ) : null}

                  <span className="track-row__duration muted">
                    {formatTrackDuration(track.durationRaw, track.durationSec)}
                  </span>
                </div>
              </div>
              );
            })
          ) : (
            <div className="empty-state">
              {lang === 'ru'
                ? 'Треки появятся после следующей синхронизации Discogs.'
                : 'Tracks will appear after the next Discogs sync.'}
            </div>
          )}
        </div>
      </div>

      {isLightboxOpen ? (
        <div
          className="release-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={lang === 'ru' ? 'Обложка релиза' : 'Release cover'}
          onClick={() => setIsLightboxOpen(false)}
        >
          <button
            type="button"
            className="release-lightbox__close"
            aria-label={lang === 'ru' ? 'Закрыть' : 'Close'}
            onClick={() => setIsLightboxOpen(false)}
          >
            <X size={22} />
          </button>
          <div className="release-lightbox__image-shell" onClick={(event) => event.stopPropagation()}>
            {galleryImages.length > 1 ? (
              <div
                className="release-lightbox__switcher"
                role="tablist"
                aria-label={lang === 'ru' ? 'Стороны релиза' : 'Release sides'}
              >
                {galleryImages.map((image, index) => (
                  <button
                    key={image.key}
                    type="button"
                    className={`release-lightbox__switch${index === activeImageIndex ? ' active' : ''}`}
                    onClick={() => setActiveImageIndex(index)}
                    role="tab"
                    aria-selected={index === activeImageIndex}
                  >
                    {image.label}
                  </button>
                ))}
              </div>
            ) : null}
            <img
              src={activeImage.src}
              alt={`${release.title} ${activeImage.label}`}
              className="release-lightbox__image"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
