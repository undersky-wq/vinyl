'use client';

import { ChevronLeft, Copy, ImagePlus, Play, Plus, Share2, Trash2, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  createReleaseTrack,
  createReleaseTimelineComment,
  deleteReleaseTrack,
  deleteRelease,
  deleteTrackAudio,
  getReleaseTimelineComments,
  updateReleaseMetadata,
  updateReleaseStyles,
  updateTrackMetadata,
  uploadReleaseCover,
} from '../lib/api';
import { SiteLang } from '../lib/language';
import { useAuth } from '../providers/auth-provider';
import { PlayerTrack, usePlayer } from '../providers/player-provider';
import { Release, TimelineComment } from '../types';
import { CoverArtwork } from './cover-artwork';
import { FavoriteButton, TrackPlaylistMenu } from './track-actions';
import { TrackUploadButton } from './track-upload-button';
import { getNearestTimelineComment, TimelineCommentMarkers } from './timeline-comment-markers';

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

function EditableTrackText({
  value,
  className,
  disabled,
  ariaLabel,
  onSave,
}: {
  value: string;
  className: string;
  disabled?: boolean;
  ariaLabel: string;
  onSave: (value: string) => Promise<void>;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isEditing) {
      setDraft(value);
    }
  }, [isEditing, value]);

  if (isEditing) {
    return (
      <input
        className={`track-text-input ${className}`}
        value={draft}
        autoFocus
        disabled={isSaving}
        aria-label={ariaLabel}
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
          const nextValue = draft.trim();
          if (!nextValue) {
            setIsEditing(false);
            return;
          }

          setIsSaving(true);
          try {
            await onSave(nextValue);
            setIsEditing(false);
          } finally {
            setIsSaving(false);
          }
        }}
      />
    );
  }

  if (disabled) {
    return <span className={className}>{value}</span>;
  }

  return (
    <button
      type="button"
      className={`track-text-edit ${className}`}
      aria-label={ariaLabel}
      onClick={() => setIsEditing(true)}
    >
      {value}
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

function formatCommentTime(second: number) {
  const safeSecond = Math.max(0, Math.floor(second));
  const minutes = Math.floor(safeSecond / 60);
  const seconds = safeSecond % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function getAvatarInitial(name?: string | null) {
  return (name || 'U').trim().charAt(0).toUpperCase() || 'U';
}

function getReleaseShareUrl(releaseId: string) {
  if (typeof window === 'undefined') {
    return `/releases/${releaseId}`;
  }

  return `${window.location.origin}/releases/${releaseId}`;
}

function MixDetailPanel({
  release,
  tracks,
  currentTrackId,
  getAudioElement,
  playQueue,
  playQueueAtPercent,
  seekToPercent,
  lang,
}: {
  release: Release;
  tracks: ReleasePlayerTrack[];
  currentTrackId?: string;
  getAudioElement: () => HTMLAudioElement | null;
  playQueue: (tracks: PlayerTrack[], startIndex: number) => void;
  playQueueAtPercent: (tracks: PlayerTrack[], startIndex: number, percent: number) => void;
  seekToPercent: (percent: number) => void;
  lang: SiteLang;
}) {
  const { user, requireAuth } = useAuth();
  const sourceTrack =
    tracks.find((track) => track.id === currentTrackId) ||
    tracks.find((track) => track.waveformData.length) ||
    tracks[0];
  const peaks = (sourceTrack?.waveformData.length
    ? sourceTrack.waveformData
    : buildFallbackWaveform(`${sourceTrack?.artist || ''}-${sourceTrack?.title || ''}`)).slice(0, 180);
  const [progressPercent, setProgressPercent] = useState(0);
  const [elapsedSecond, setElapsedSecond] = useState(0);
  const [comments, setComments] = useState<TimelineComment[]>([]);
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
  const [isWaveDragging, setIsWaveDragging] = useState(false);
  const [selectedSecond, setSelectedSecond] = useState<number | null>(null);
  const [commentText, setCommentText] = useState('');
  const [commentStatus, setCommentStatus] = useState('');
  const [shareStatus, setShareStatus] = useState('');
  const [isSavingComment, setIsSavingComment] = useState(false);
  const isCurrentMixPlaying = tracks.some((track) => track.id === currentTrackId);
  const durationSec = sourceTrack?.durationSec || 0;

  useEffect(() => {
    let cancelled = false;

    getReleaseTimelineComments(release.id)
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
  }, [release.id]);

  useEffect(() => {
    const audio = getAudioElement();
    if (!isCurrentMixPlaying || !audio) {
      setProgressPercent(0);
      setElapsedSecond(0);
      return;
    }

    const syncProgress = () => {
      if (!Number.isFinite(audio.duration) || audio.duration <= 0) {
        setProgressPercent(0);
        setElapsedSecond(0);
        return;
      }

      setProgressPercent((audio.currentTime / audio.duration) * 100);
      setElapsedSecond(Math.floor(audio.currentTime));
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
  }, [currentTrackId, getAudioElement, isCurrentMixPlaying]);

  function getWavePercent(event: React.PointerEvent<HTMLButtonElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return Math.max(0, Math.min(((event.clientX - rect.left) / rect.width) * 100, 100));
  }

  function updateWaveSelection(percent: number) {
    const nextSecond = durationSec ? Math.round((percent / 100) * durationSec) : 0;
    const nearest = getNearestTimelineComment(comments, percent, durationSec);

    setSelectedSecond(nextSecond);
    setActiveCommentId(nearest?.id || null);
    setCommentStatus('');
  }

  function commitWaveSeek(percent: number) {
    if (!tracks.length) {
      return;
    }

    const audio = getAudioElement();

    if (isCurrentMixPlaying && audio && Number.isFinite(audio.duration) && audio.duration > 0) {
      seekToPercent(percent);
      return;
    }

    playQueueAtPercent(tracks, 0, percent);
  }

  function handleWavePointerDown(event: React.PointerEvent<HTMLButtonElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    const percent = getWavePercent(event);
    setIsWaveDragging(true);
    updateWaveSelection(percent);
  }

  function handleWavePointerMove(event: React.PointerEvent<HTMLButtonElement>) {
    if (!isWaveDragging) {
      const percent = getWavePercent(event);
      const nearest = getNearestTimelineComment(comments, percent, durationSec);
      setActiveCommentId(nearest?.id || null);
      return;
    }

    updateWaveSelection(getWavePercent(event));
  }

  function handleWavePointerUp(event: React.PointerEvent<HTMLButtonElement>) {
    const percent = getWavePercent(event);
    updateWaveSelection(percent);
    commitWaveSeek(percent);
    setIsWaveDragging(false);
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function handleWavePointerCancel() {
    setIsWaveDragging(false);
    setActiveCommentId(null);
  }

  async function handleSaveComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!requireAuth()) {
      return;
    }

    const text = commentText.trim();
    if (!text || selectedSecond === null) {
      return;
    }

    setIsSavingComment(true);
    setCommentStatus('');
    try {
      const comment = await createReleaseTimelineComment(release.id, {
        second: selectedSecond,
        text,
      });
      setComments((current) => [...current, comment].sort((a, b) => a.second - b.second));
      setCommentText('');
      setSelectedSecond(null);
    } catch {
      setCommentStatus(lang === 'ru' ? 'Комментарий не сохранён.' : 'Comment was not saved.');
    } finally {
      setIsSavingComment(false);
    }
  }

  async function handleCopyLink() {
    const url = getReleaseShareUrl(release.id);
    try {
      await navigator.clipboard.writeText(url);
      setShareStatus(lang === 'ru' ? 'Ссылка скопирована.' : 'Link copied.');
    } catch {
      setShareStatus(url);
    }
  }

  async function handleShare() {
    const url = getReleaseShareUrl(release.id);
    const title = `${release.artist} - ${release.title}`;
    if (navigator.share) {
      try {
        await navigator.share({ title, text: title, url });
        return;
      } catch {
        return;
      }
    }

    await handleCopyLink();
  }

  if (!tracks.length) {
    return null;
  }

  return (
    <section className="release-panel mix-detail-panel">
      <button
        type="button"
        className="mix-detail-play"
        onClick={() => playQueue(tracks, 0)}
        aria-label={lang === 'ru' ? 'Воспроизвести микс' : 'Play mix'}
      >
        <Play size={22} fill="currentColor" />
      </button>

      <div className="mix-wave mix-detail-wave">
        <div className="mix-wave__timeline">
          <button
            type="button"
            className="library-wave__bars is-decoded mix-wave__bars"
            onPointerDown={handleWavePointerDown}
            onPointerMove={handleWavePointerMove}
            onPointerUp={handleWavePointerUp}
            onPointerLeave={() => {
              if (!isWaveDragging) {
                setActiveCommentId(null);
              }
            }}
            onPointerCancel={handleWavePointerCancel}
            aria-label="Seek mix waveform"
          >
            {peaks.map((peak, index) => (
              <span
                className={`library-wave__bar${
                  (index / Math.max(peaks.length - 1, 1)) * 100 <= progressPercent ? ' is-active' : ''
                }`}
                key={`${sourceTrack?.id || 'mix'}-${index}`}
                style={{ height: `${Math.max(8, Math.round(peak * 100))}%` }}
              />
            ))}
          </button>

          <TimelineCommentMarkers
            comments={comments}
            durationSec={durationSec}
            activeCommentId={activeCommentId}
          />
        </div>
        <div className="mix-wave__time-row">
          <span>{formatCommentTime(elapsedSecond)}</span>
          <span>{formatTrackDuration(sourceTrack?.durationRaw, sourceTrack?.durationSec)}</span>
        </div>

        <div className="mix-detail-actions">
          <button type="button" className="mix-share-button" onClick={() => void handleCopyLink()}>
            <Copy size={15} />
            Copy link
          </button>
          <button type="button" className="mix-share-button" onClick={() => void handleShare()}>
            <Share2 size={15} />
            Share
          </button>
          {shareStatus ? <span className="muted">{shareStatus}</span> : null}
        </div>

        <form className="mix-comment-composer" onSubmit={handleSaveComment}>
          <span className="mix-comment-composer__avatar">
            {user?.avatarStorageUrl ? (
              <img src={user.avatarStorageUrl} alt={user.displayName} />
            ) : (
              getAvatarInitial(user?.displayName)
            )}
          </span>
          <span className="mix-comment-composer__time">
            {selectedSecond === null ? '--:--' : formatCommentTime(selectedSecond)}
          </span>
          <input
            value={commentText}
            onChange={(event) => setCommentText(event.target.value)}
            placeholder={lang === 'ru' ? 'Комментарий на таймлайне...' : 'Comment on the timeline...'}
            maxLength={280}
          />
          <button type="submit" disabled={selectedSecond === null || !commentText.trim() || isSavingComment}>
            {isSavingComment ? '...' : lang === 'ru' ? 'Post' : 'Post'}
          </button>
        </form>
        {commentStatus ? <p className="mix-comment-status">{commentStatus}</p> : null}

        {comments.length ? (
          <div className="mix-comments" aria-label="Timeline comments">
            {comments.map((comment) => (
              <article className="mix-comment" key={comment.id}>
                <span className="mix-comment__avatar">
                  {comment.user.avatarStorageUrl ? (
                    <img src={comment.user.avatarStorageUrl} alt={comment.user.displayName} />
                  ) : (
                    getAvatarInitial(comment.user.displayName)
                  )}
                </span>
                <div>
                  <strong>{comment.user.displayName}</strong>
                  <span>{formatCommentTime(comment.second)}</span>
                  <p>{comment.text}</p>
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}

export function ReleaseDetail({ release, lang }: ReleaseDetailProps) {
  const { currentTrack, playQueue, playQueueAtPercent, seekToPercent, getAudioElement } = usePlayer();
  const { user, requireAuth } = useAuth();
  const router = useRouter();
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [deletingAudioId, setDeletingAudioId] = useState<string | null>(null);
  const [deletingTrackId, setDeletingTrackId] = useState<string | null>(null);
  const [isDeletingRelease, setIsDeletingRelease] = useState(false);
  const [isUploadingCover, setIsUploadingCover] = useState(false);
  const [tracks, setTracks] = useState(() => release.tracks);
  const [newTrackDraft, setNewTrackDraft] = useState({ position: '', artist: '', title: '' });
  const [isCreatingTrack, setIsCreatingTrack] = useState(false);
  const [uploadedCoverUrl, setUploadedCoverUrl] = useState<string | null>(null);
  const [styleTags, setStyleTags] = useState(() => [...release.styles]);
  const [styleDraft, setStyleDraft] = useState('');
  const [isSavingStyles, setIsSavingStyles] = useState(false);
  const [releaseText, setReleaseText] = useState(() => ({
    artist: release.artist,
    title: release.title,
  }));
  const coverInputRef = useRef<HTMLInputElement | null>(null);
  const [trackMetaById, setTrackMetaById] = useState(() =>
    Object.fromEntries(
      tracks.map((track) => [
        track.id,
        {
          bpm: track.bpm,
          key: track.key,
        },
      ]),
    ),
  );
  const [trackTextById, setTrackTextById] = useState(() =>
    Object.fromEntries(
      tracks.map((track) => [
        track.id,
        {
          artist: getTrackArtist(track, release.artist),
          title: track.title,
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

  const playableTracks: ReleasePlayerTrack[] = tracks
    .map((track): ReleasePlayerTrack | null => {
      if (!track.audioFiles?.length) {
        return null;
      }

      const audioUrl = track.audioFiles?.find((file) => file.storageUrl)?.storageUrl || '';
      if (!audioUrl) {
        return null;
      }

      const trackText = trackTextById[track.id] || {
        artist: getTrackArtist(track, release.artist),
        title: track.title,
      };

      return {
        id: track.id,
        title: trackText.title,
        artist: trackText.artist,
        audioUrl,
        coverUrl: coverSrc,
        releaseId: release.id,
        isPublic: Boolean(release.isMix),
        durationRaw: track.durationRaw ?? null,
        durationSec: track.durationSec ?? null,
        waveformData: Array.isArray(track.waveformData)
          ? track.waveformData.filter((value): value is number => typeof value === 'number')
          : [],
      };
    })
    .filter((track): track is ReleasePlayerTrack => Boolean(track));

  const meta = [release.year, release.country].filter(Boolean).join(' • ');
  const isAdmin = user?.role === 'ADMIN';

  useEffect(() => {
    setStyleTags([...release.styles]);
  }, [release.styles]);

  useEffect(() => {
    setReleaseText({
      artist: release.artist,
      title: release.title,
    });
  }, [release.artist, release.title]);

  useEffect(() => {
    setTracks(release.tracks);
  }, [release.tracks]);

  useEffect(() => {
    setTrackTextById(
      Object.fromEntries(
        tracks.map((track) => [
          track.id,
          {
            artist: getTrackArtist(track, release.artist),
            title: track.title,
          },
        ]),
      ),
    );
  }, [release.artist, tracks]);

  async function saveReleaseStyles(nextStyles: string[]) {
    setStyleTags(nextStyles);
    setIsSavingStyles(true);
    try {
      const updatedRelease = await updateReleaseStyles(release.id, nextStyles);
      setStyleTags(updatedRelease.styles);
      router.refresh();
    } finally {
      setIsSavingStyles(false);
    }
  }

  async function handleAddStyle() {
    const nextStyle = styleDraft.trim();
    if (!nextStyle) {
      return;
    }

    const hasStyle = styleTags.some((style) => style.toLocaleLowerCase() === nextStyle.toLocaleLowerCase());
    setStyleDraft('');
    if (hasStyle) {
      return;
    }

    await saveReleaseStyles([...styleTags, nextStyle]);
  }

  async function handleRemoveStyle(styleToRemove: string) {
    await saveReleaseStyles(styleTags.filter((style) => style !== styleToRemove));
  }

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

  async function handleCreateTrack(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const title = newTrackDraft.title.trim();
    if (!title) {
      return;
    }

    setIsCreatingTrack(true);
    try {
      const createdTrack = await createReleaseTrack(release.id, {
        position: newTrackDraft.position.trim() || undefined,
        artist: newTrackDraft.artist.trim() || undefined,
        title,
      });

      setTracks((current) => [...current, createdTrack]);
      setTrackMetaById((current) => ({
        ...current,
        [createdTrack.id]: {
          bpm: createdTrack.bpm,
          key: createdTrack.key,
        },
      }));
      setTrackTextById((current) => ({
        ...current,
        [createdTrack.id]: {
          artist: getTrackArtist(createdTrack, release.artist),
          title: createdTrack.title,
        },
      }));
      setNewTrackDraft({ position: '', artist: '', title: '' });
      router.refresh();
    } finally {
      setIsCreatingTrack(false);
    }
  }

  async function handleDeleteTrack(trackId: string, title: string) {
    const confirmed = window.confirm(
      lang === 'ru'
        ? `Удалить трек "${title}" целиком? MP3 и привязки к плейлистам тоже удалятся.`
        : `Delete track "${title}" completely? MP3 and playlist links will also be removed.`,
    );

    if (!confirmed) {
      return;
    }

    setDeletingTrackId(trackId);
    try {
      await deleteReleaseTrack(trackId);
      setTracks((current) => current.filter((track) => track.id !== trackId));
      setTrackMetaById((current) => {
        const next = { ...current };
        delete next[trackId];
        return next;
      });
      setTrackTextById((current) => {
        const next = { ...current };
        delete next[trackId];
        return next;
      });
      router.refresh();
    } finally {
      setDeletingTrackId(null);
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

  async function handleTrackTextSave(trackId: string, patch: { artist?: string; title?: string }) {
    const currentText = trackTextById[trackId] || { artist: release.artist, title: '' };
    const nextText = {
      ...currentText,
      ...patch,
    };

    setTrackTextById((current) => ({
      ...current,
      [trackId]: nextText,
    }));

    try {
      const updatedTrack = await updateTrackMetadata(trackId, {
        title: nextText.title,
        artists: nextText.artist ? [nextText.artist] : [],
      });

      setTrackTextById((current) => ({
        ...current,
        [trackId]: {
          artist: getTrackArtist(updatedTrack, release.artist),
          title: updatedTrack.title,
        },
      }));
    } catch (error) {
      setTrackTextById((current) => ({
        ...current,
        [trackId]: currentText,
      }));
      window.alert(error instanceof Error ? error.message : 'Track rename failed');
      throw error;
    }
  }

  async function handleReleaseTextSave(patch: { artist?: string; title?: string }) {
    const currentText = releaseText;
    const nextText = {
      ...releaseText,
      ...patch,
    };

    setReleaseText(nextText);
    try {
      const updatedRelease = await updateReleaseMetadata(release.id, nextText);
      setReleaseText({
        artist: updatedRelease.artist,
        title: updatedRelease.title,
      });
    } catch (error) {
      setReleaseText(currentText);
      window.alert(error instanceof Error ? error.message : 'Release rename failed');
      throw error;
    }
  }

  return (
    <div className="release-page">
      <div className="release-mobile-backbar">
        <button
          type="button"
          className="release-mobile-backbar__button"
          onClick={() => router.back()}
          aria-label={lang === 'ru' ? 'Назад' : 'Back'}
        >
          <ChevronLeft size={23} />
        </button>
        <div className="release-mobile-backbar__text">
          <strong>{releaseText.title}</strong>
          <span>{releaseText.artist}</span>
        </div>
      </div>

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
              <EditableTrackText
                value={releaseText.artist}
                className="release-heading__artist"
                disabled={!isAdmin}
                ariaLabel={lang === 'ru' ? 'Редактировать артиста релиза' : 'Edit release artist'}
                onSave={async (value) => {
                  await handleReleaseTextSave({ artist: value });
                }}
              />
              <span className="release-heading__dash">—</span>
              <EditableTrackText
                value={releaseText.title}
                className="release-heading__title"
                disabled={!isAdmin}
                ariaLabel={lang === 'ru' ? 'Редактировать название релиза' : 'Edit release title'}
                onSave={async (value) => {
                  await handleReleaseTextSave({ title: value });
                }}
              />
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
          {styleTags.length || isAdmin ? (
            <div className={`tag-list release-style-editor${isSavingStyles ? ' is-saving' : ''}`}>
              {styleTags.map((tag) =>
                isAdmin ? (
                  <button
                    type="button"
                    className="tag-pill tag-pill--editable"
                    key={tag}
                    disabled={isSavingStyles}
                    onClick={() => void handleRemoveStyle(tag)}
                    aria-label={lang === 'ru' ? `Убрать стиль ${tag}` : `Remove style ${tag}`}
                  >
                    <span>{tag}</span>
                    <X size={13} />
                  </button>
                ) : (
                  <span className="tag-pill" key={tag}>
                    {tag}
                  </span>
                ),
              )}
              {isAdmin ? (
                <form
                  className="release-style-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void handleAddStyle();
                  }}
                >
                  <input
                    className="release-style-input"
                    value={styleDraft}
                    disabled={isSavingStyles}
                    placeholder={lang === 'ru' ? 'Добавить стиль' : 'Add style'}
                    onChange={(event) => setStyleDraft(event.target.value)}
                  />
                  <button
                    type="submit"
                    className="release-style-add"
                    disabled={isSavingStyles || !styleDraft.trim()}
                    aria-label={lang === 'ru' ? 'Добавить стиль' : 'Add style'}
                  >
                    <Plus size={15} />
                  </button>
                </form>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {release.isMix && playableTracks.length ? (
        <MixDetailPanel
          release={release}
          tracks={playableTracks}
          currentTrackId={currentTrack?.id}
          getAudioElement={getAudioElement}
          playQueue={playQueue}
          playQueueAtPercent={playQueueAtPercent}
          seekToPercent={seekToPercent}
          lang={lang}
        />
      ) : null}

      {!release.isMix ? (
      <div className="release-panel">
        {isAdmin ? (
          <form className="release-track-form" onSubmit={handleCreateTrack}>
            <input
              value={newTrackDraft.position}
              placeholder="A1"
              aria-label={lang === 'ru' ? 'Позиция трека' : 'Track position'}
              onChange={(event) =>
                setNewTrackDraft((current) => ({
                  ...current,
                  position: event.target.value,
                }))
              }
            />
            <input
              value={newTrackDraft.artist}
              placeholder={lang === 'ru' ? 'Артист' : 'Artist'}
              aria-label={lang === 'ru' ? 'Артист трека' : 'Track artist'}
              onChange={(event) =>
                setNewTrackDraft((current) => ({
                  ...current,
                  artist: event.target.value,
                }))
              }
            />
            <input
              value={newTrackDraft.title}
              placeholder={lang === 'ru' ? 'Название трека' : 'Track title'}
              aria-label={lang === 'ru' ? 'Название трека' : 'Track title'}
              required
              onChange={(event) =>
                setNewTrackDraft((current) => ({
                  ...current,
                  title: event.target.value,
                }))
              }
            />
            <button type="submit" disabled={isCreatingTrack || !newTrackDraft.title.trim()}>
              <Plus size={15} />
              {isCreatingTrack ? (lang === 'ru' ? 'Добавляю...' : 'Adding...') : lang === 'ru' ? 'Добавить трек' : 'Add track'}
            </button>
          </form>
        ) : null}
        <div className="tracklist">
          {tracks.length ? (
            tracks.map((track) => {
              const audioFile = track.audioFiles?.[0] || null;
              const trackMeta = trackMetaById[track.id] || { bpm: track.bpm, key: track.key };
              const trackText = trackTextById[track.id] || {
                artist: getTrackArtist(track, release.artist),
                title: track.title,
              };
              const isCurrentTrack = currentTrack?.id === track.id;

              return (
              <div className={`track-row${isCurrentTrack ? ' active' : ''}`} key={track.id}>
                <div className="track-row__actions track-row__actions--leading">
                  {audioFile ? (
                    <button
                      type="button"
                      className="track-icon-button track-row__play-button"
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
                      <Play size={18} fill="currentColor" />
                    </button>
                  ) : user?.role === 'ADMIN' ? (
                    <TrackUploadButton trackId={track.id} lang={lang} />
                  ) : (
                    <span className="track-row__empty-action" />
                  )}
                </div>

                <div className="track-row__position-cell">
                  {track.position ? <span className="track-row__position">{track.position}</span> : null}
                </div>

                <div className="track-row__title-block">
                  <EditableTrackText
                    value={trackText.artist}
                    className="track-row__artist"
                    disabled={!isAdmin}
                    ariaLabel={lang === 'ru' ? 'Редактировать артиста трека' : 'Edit track artist'}
                    onSave={async (value) => {
                      await handleTrackTextSave(track.id, { artist: value });
                    }}
                  />
                  <EditableTrackText
                    value={trackText.title}
                    className="track-row__title"
                    disabled={!isAdmin}
                    ariaLabel={lang === 'ru' ? 'Редактировать название трека' : 'Edit track title'}
                    onSave={async (value) => {
                      await handleTrackTextSave(track.id, { title: value });
                    }}
                  />
                </div>

                <span className="track-row__duration muted">
                  {formatTrackDuration(track.durationRaw, track.durationSec)}
                </span>

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
                  {user?.role === 'ADMIN' ? (
                    <button
                      type="button"
                      className="track-icon-button track-icon-button--danger"
                      aria-label={lang === 'ru' ? 'Удалить трек целиком' : 'Delete whole track'}
                      disabled={deletingTrackId === track.id}
                      onClick={() => void handleDeleteTrack(track.id, trackText.title)}
                    >
                      <X size={15} />
                    </button>
                  ) : null}
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
      ) : null}

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
