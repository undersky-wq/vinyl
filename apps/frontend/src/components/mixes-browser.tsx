'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Copy, LoaderCircle, Pencil, Play, Plus, Save, Share2, Trash2, UploadCloud, X } from 'lucide-react';
import {
  createManualRelease,
  deleteRelease,
  getReleaseTimelineComments,
  updateReleaseMetadata,
  updateReleaseStyles,
  uploadReleaseCover,
  uploadTrackAudio,
} from '../lib/api';
import { SiteLang } from '../lib/language';
import { buildFallbackWaveform, useResponsiveWaveform } from '../lib/waveform';
import { useAuth } from '../providers/auth-provider';
import { PlayerTrack, usePlayerActions, usePlayerTransport } from '../providers/player-provider';
import { Release, TimelineComment, Track } from '../types';

type MixesBrowserProps = {
  lang: SiteLang;
  releases: Release[];
};

type MixPlayerTrack = PlayerTrack & {
  durationRaw?: string | null;
  durationSec?: number | null;
};

type MixFormState = {
  artist: string;
  title: string;
  year: string;
  styles: string;
  coverFile: File | null;
  audioFile: File | null;
};

function getInitialForm(release?: Release): MixFormState {
  return {
    artist: release?.artist || '',
    title: release?.title || '',
    year: release?.year ? String(release.year) : '',
    styles: release?.styles.join(', ') || '',
    coverFile: null,
    audioFile: null,
  };
}

function getCoverUrl(release: Release) {
  return release.coverMediumStorageUrl || release.coverStorageUrl || release.coverImageUrl || '/icon.png';
}

function getTrackArtist(track: Track, release: Release) {
  return track.artists.length ? track.artists.join(', ') : release.artist;
}

function parseStyles(input: string) {
  return input
    .split(',')
    .map((style) => style.trim())
    .filter(Boolean);
}

function parseYear(input: string) {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  const value = Number(trimmed);
  return Number.isInteger(value) ? value : null;
}

function toPlayerTrack(release: Release, track: Track): MixPlayerTrack | null {
  const audioUrl = track.audioFiles.find((file) => file.storageUrl)?.storageUrl;
  if (!audioUrl) {
    return null;
  }

  return {
    id: track.id,
    title: track.title || release.title,
    artist: getTrackArtist(track, release),
    audioUrl,
    coverUrl: getCoverUrl(release),
    releaseId: release.id,
    isPublic: true,
    durationRaw: track.durationRaw,
    durationSec: track.durationSec,
    waveformData: Array.isArray(track.waveformData)
      ? track.waveformData.filter((value): value is number => typeof value === 'number')
      : [],
  };
}

function formatDuration(durationRaw?: string | null, durationSec?: number | null) {
  if (durationRaw) {
    return durationRaw;
  }

  if (!durationSec || !Number.isFinite(durationSec)) {
    return '';
  }

  const minutes = Math.floor(durationSec / 60);
  const seconds = durationSec % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
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

function getMixShareUrl(releaseId: string) {
  if (typeof window === 'undefined') {
    return `/releases/${releaseId}`;
  }

  return `${window.location.origin}/releases/${releaseId}`;
}

function MixWaveform({ release, tracks }: { release: Release; tracks: MixPlayerTrack[] }) {
  const { currentTrack } = usePlayerTransport();
  const { getAudioElement, playQueueAtPercent, seekToPercent } = usePlayerActions();
  const sourceTrack = tracks.find((track) => track.id === currentTrack?.id) || tracks[0];
  const sourcePeaks = sourceTrack?.waveformData?.length
    ? sourceTrack.waveformData
    : buildFallbackWaveform(`${sourceTrack?.artist || ''}-${sourceTrack?.title || ''}`);
  const { ref: waveformRef, peaks } = useResponsiveWaveform(sourcePeaks, {
    minBars: 76,
    maxBars: 210,
    pixelsPerBar: 5,
  });
  const [progressPercent, setProgressPercent] = useState(0);
  const [comments, setComments] = useState<TimelineComment[]>([]);
  const isCurrentMixPlaying = tracks.some((track) => track.id === currentTrack?.id);
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
      return;
    }

    const sync = () => {
      if (!Number.isFinite(audio.duration) || audio.duration <= 0) {
        setProgressPercent(0);
        return;
      }

      setProgressPercent((audio.currentTime / audio.duration) * 100);
    };

    sync();
    audio.addEventListener('timeupdate', sync);
    audio.addEventListener('loadedmetadata', sync);
    audio.addEventListener('seeked', sync);

    return () => {
      audio.removeEventListener('timeupdate', sync);
      audio.removeEventListener('loadedmetadata', sync);
      audio.removeEventListener('seeked', sync);
    };
  }, [getAudioElement, isCurrentMixPlaying]);

  function handleSeek(event: React.MouseEvent<HTMLButtonElement>) {
    if (!tracks.length) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const percent = Math.max(0, Math.min(((event.clientX - rect.left) / rect.width) * 100, 100));
    const audio = getAudioElement();

    if (isCurrentMixPlaying && audio && Number.isFinite(audio.duration) && audio.duration > 0) {
      seekToPercent(percent);
      return;
    }

    playQueueAtPercent(tracks, 0, percent);
  }

  if (!tracks.length) {
    return null;
  }

  return (
    <div className="mix-wave">
      <div className="mix-wave__timeline">
        <button
          type="button"
          ref={waveformRef}
          className="library-wave__bars is-decoded mix-wave__bars"
          onClick={handleSeek}
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

        {comments.map((comment) => {
          const markerPercent = durationSec
            ? Math.max(0, Math.min((comment.second / durationSec) * 100, 100))
            : 0;

          return (
            <span
              className="mix-comment-marker"
              key={comment.id}
              style={{ left: `${markerPercent}%` }}
            >
              {comment.user.avatarStorageUrl ? (
                <img src={comment.user.avatarStorageUrl} alt={comment.user.displayName} />
              ) : (
                getAvatarInitial(comment.user.displayName)
              )}
              <span className="mix-comment-marker__tip" role="tooltip">
                <strong>{comment.user.displayName}</strong>
                <span>{formatCommentTime(comment.second)}</span>
                <span className="mix-comment-marker__text">{comment.text}</span>
              </span>
            </span>
          );
        })}
      </div>
      <span className="library-wave__duration">
        {formatDuration(sourceTrack?.durationRaw, sourceTrack?.durationSec)}
      </span>
    </div>
  );
}

export function MixesBrowser({ lang, releases }: MixesBrowserProps) {
  const { playQueue } = usePlayerActions();
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const [localReleases, setLocalReleases] = useState(releases);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<MixFormState>(() => getInitialForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<MixFormState>(() => getInitialForm());
  const [status, setStatus] = useState('');
  const [shareStatus, setShareStatus] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const mixes = useMemo(
    () =>
      localReleases
        .map((release) => {
          const tracks = release.tracks.map((track) => toPlayerTrack(release, track)).filter(Boolean) as MixPlayerTrack[];
          return { release, tracks };
        })
        .filter((item) => item.tracks.length),
    [localReleases],
  );

  function updateCreateForm(patch: Partial<MixFormState>) {
    setCreateForm((current) => ({ ...current, ...patch }));
  }

  function updateEditForm(patch: Partial<MixFormState>) {
    setEditForm((current) => ({ ...current, ...patch }));
  }

  async function handleCreateMix(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus('');

    if (!createForm.artist.trim() || !createForm.title.trim() || !createForm.audioFile) {
      setStatus(lang === 'ru' ? 'Заполни артиста, название и MP3.' : 'Fill artist, title and MP3.');
      return;
    }

    const payload = new FormData();
    payload.append('artist', createForm.artist.trim());
    payload.append('title', createForm.title.trim());
    payload.append('year', createForm.year.trim());
    payload.append('country', '');
    payload.append('styles', createForm.styles.trim());
    payload.append('isMix', 'true');
    payload.append(
      'tracks',
      JSON.stringify([
        {
          position: 'A1',
          artist: createForm.artist.trim(),
          title: createForm.title.trim(),
          bpm: '',
          key: '',
        },
      ]),
    );
    payload.append('audio-0', createForm.audioFile);
    if (createForm.coverFile) {
      payload.append('cover', createForm.coverFile);
    }

    setBusyId('create');
    try {
      const created = await createManualRelease(payload);
      setLocalReleases((current) => [created, ...current]);
      setCreateForm(getInitialForm());
      setIsCreateOpen(false);
      setStatus(lang === 'ru' ? 'Микс добавлен.' : 'Mix added.');
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      setStatus(lang === 'ru' ? `Не удалось добавить микс${message ? `: ${message}` : '.'}` : `Failed to add mix${message ? `: ${message}` : '.'}`);
    } finally {
      setBusyId(null);
    }
  }

  function startEditing(release: Release) {
    setEditingId(release.id);
    setEditForm(getInitialForm(release));
    setStatus('');
  }

  async function handleSaveMix(release: Release) {
    setBusyId(release.id);
    setStatus('');

    try {
      let updated = await updateReleaseMetadata(release.id, {
        artist: editForm.artist.trim(),
        title: editForm.title.trim(),
        year: parseYear(editForm.year),
      });
      updated = await updateReleaseStyles(release.id, parseStyles(editForm.styles));

      if (editForm.coverFile) {
        updated = await uploadReleaseCover(release.id, editForm.coverFile);
      }

      if (editForm.audioFile && updated.tracks[0]) {
        await uploadTrackAudio(updated.tracks[0].id, editForm.audioFile);
      }

      setLocalReleases((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setEditingId(null);
      setStatus(lang === 'ru' ? 'Микс обновлён.' : 'Mix updated.');
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      setStatus(lang === 'ru' ? `Не удалось сохранить микс${message ? `: ${message}` : '.'}` : `Failed to save mix${message ? `: ${message}` : '.'}`);
    } finally {
      setBusyId(null);
    }
  }

  async function handleDeleteMix(release: Release) {
    if (!window.confirm(lang === 'ru' ? `Удалить микс "${release.title}"?` : `Delete mix "${release.title}"?`)) {
      return;
    }

    setBusyId(release.id);
    try {
      await deleteRelease(release.id);
      setLocalReleases((current) => current.filter((item) => item.id !== release.id));
      setStatus(lang === 'ru' ? 'Микс удалён.' : 'Mix deleted.');
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      setStatus(lang === 'ru' ? `Не удалось удалить микс${message ? `: ${message}` : '.'}` : `Failed to delete mix${message ? `: ${message}` : '.'}`);
    } finally {
      setBusyId(null);
    }
  }

  async function handleCopyLink(release: Release) {
    const url = getMixShareUrl(release.id);
    try {
      await navigator.clipboard.writeText(url);
      setShareStatus(lang === 'ru' ? 'Ссылка скопирована.' : 'Link copied.');
    } catch {
      setShareStatus(url);
    }
  }

  async function handleShare(release: Release) {
    const url = getMixShareUrl(release.id);
    const title = `${release.artist} - ${release.title}`;
    if (navigator.share) {
      try {
        await navigator.share({ title, text: title, url });
        return;
      } catch {
        return;
      }
    }

    await handleCopyLink(release);
  }

  if (!mixes.length && !isAdmin) {
    return (
      <section className="mixes-empty">
        {lang === 'ru' ? 'Миксы появятся здесь после загрузки MP3.' : 'Mixes will appear here after MP3 upload.'}
      </section>
    );
  }

  return (
    <>
      {isAdmin ? (
        <section className="mix-admin-panel">
          <button className="nav-link mix-admin-panel__toggle" type="button" onClick={() => setIsCreateOpen((current) => !current)}>
            {isCreateOpen ? <X size={17} /> : <Plus size={17} />}
            {lang === 'ru' ? 'Добавить микс' : 'Add mix'}
          </button>

          {isCreateOpen ? (
            <form className="mix-admin-form" onSubmit={handleCreateMix}>
              <input value={createForm.artist} onChange={(event) => updateCreateForm({ artist: event.target.value })} placeholder={lang === 'ru' ? 'Артист' : 'Artist'} />
              <input value={createForm.title} onChange={(event) => updateCreateForm({ title: event.target.value })} placeholder={lang === 'ru' ? 'Название микса' : 'Mix title'} />
              <input value={createForm.year} onChange={(event) => updateCreateForm({ year: event.target.value })} placeholder={lang === 'ru' ? 'Год' : 'Year'} inputMode="numeric" />
              <input value={createForm.styles} onChange={(event) => updateCreateForm({ styles: event.target.value })} placeholder="House, Disco, Deep House" />
              <label className="mix-file-control">
                <UploadCloud size={15} />
                <span>{createForm.coverFile ? createForm.coverFile.name : lang === 'ru' ? 'Обложка' : 'Cover'}</span>
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => updateCreateForm({ coverFile: event.target.files?.[0] || null })} />
              </label>
              <label className="mix-file-control">
                <UploadCloud size={15} />
                <span>{createForm.audioFile ? createForm.audioFile.name : 'MP3'}</span>
                <input type="file" accept=".mp3,audio/mpeg" onChange={(event) => updateCreateForm({ audioFile: event.target.files?.[0] || null })} />
              </label>
              <button className="nav-link mix-admin-form__submit" type="submit" disabled={busyId === 'create'}>
                {busyId === 'create' ? <LoaderCircle size={16} className="track-upload-button__spinner" /> : <Save size={16} />}
                {lang === 'ru' ? 'Сохранить' : 'Save'}
              </button>
            </form>
          ) : null}

          {status ? <p className="muted">{status}</p> : null}
          {shareStatus ? <p className="muted mix-share-status">{shareStatus}</p> : null}
        </section>
      ) : null}

      <section className="mixes-page" aria-label={lang === 'ru' ? 'Миксы' : 'Mixes'}>
        {mixes.map(({ release, tracks }) => (
          <article className="mix-card" key={release.id}>
            <Link className="mix-card__cover" href={`/releases/${release.id}`} aria-label={release.title}>
              <img src={getCoverUrl(release)} alt={release.title} loading="lazy" decoding="async" />
            </Link>

            <div className="mix-card__body">
              <button className="mix-card__play" type="button" onClick={() => playQueue(tracks, 0)}>
                <Play size={22} fill="currentColor" />
              </button>
              {editingId === release.id ? (
                <div className="mix-card__edit">
                  <input value={editForm.artist} onChange={(event) => updateEditForm({ artist: event.target.value })} placeholder={lang === 'ru' ? 'Артист' : 'Artist'} />
                  <input value={editForm.title} onChange={(event) => updateEditForm({ title: event.target.value })} placeholder={lang === 'ru' ? 'Название' : 'Title'} />
                  <input value={editForm.year} onChange={(event) => updateEditForm({ year: event.target.value })} placeholder={lang === 'ru' ? 'Год' : 'Year'} inputMode="numeric" />
                  <input value={editForm.styles} onChange={(event) => updateEditForm({ styles: event.target.value })} placeholder="House, Disco" />
                </div>
              ) : (
                <Link href={`/releases/${release.id}`} className="mix-card__title">
                  <span>{release.artist}</span>
                  <strong>{release.title}</strong>
                  {release.year ? <em>{release.year}</em> : null}
                </Link>
              )}

              {isAdmin ? (
                <div className="mix-card__admin-actions">
                  {editingId === release.id ? (
                    <>
                      <label className="mix-file-control mix-file-control--compact">
                        <UploadCloud size={14} />
                        <span>{editForm.coverFile ? editForm.coverFile.name : lang === 'ru' ? 'Обложка' : 'Cover'}</span>
                        <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => updateEditForm({ coverFile: event.target.files?.[0] || null })} />
                      </label>
                      <label className="mix-file-control mix-file-control--compact">
                        <UploadCloud size={14} />
                        <span>{editForm.audioFile ? editForm.audioFile.name : 'MP3'}</span>
                        <input type="file" accept=".mp3,audio/mpeg" onChange={(event) => updateEditForm({ audioFile: event.target.files?.[0] || null })} />
                      </label>
                      <button className="track-icon-button" type="button" onClick={() => void handleSaveMix(release)} disabled={busyId === release.id}>
                        {busyId === release.id ? <LoaderCircle size={15} className="track-upload-button__spinner" /> : <Save size={15} />}
                      </button>
                      <button className="track-icon-button" type="button" onClick={() => setEditingId(null)}>
                        <X size={15} />
                      </button>
                    </>
                  ) : (
                    <>
                      <button className="track-icon-button" type="button" onClick={() => startEditing(release)}>
                        <Pencil size={15} />
                      </button>
                      <button className="track-icon-button track-icon-button--danger" type="button" onClick={() => void handleDeleteMix(release)} disabled={busyId === release.id}>
                        <Trash2 size={15} />
                      </button>
                    </>
                  )}
                </div>
              ) : null}

              {release.styles.length && editingId !== release.id ? (
                <div className="mix-card__styles">
                  {release.styles.slice(0, 8).map((style) => (
                    <span className="chip mix-card__style" key={style}>
                      {style}
                    </span>
                  ))}
                </div>
              ) : null}

              <MixWaveform release={release} tracks={tracks} />

              <div className="mix-card__share-actions">
                <button type="button" className="mix-share-button" onClick={() => void handleCopyLink(release)}>
                  <Copy size={15} />
                  Copy link
                </button>
                <button type="button" className="mix-share-button" onClick={() => void handleShare(release)}>
                  <Share2 size={15} />
                  Share
                </button>
              </div>
            </div>
          </article>
        ))}
      </section>
    </>
  );
}
