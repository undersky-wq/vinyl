'use client';

import Image from 'next/image';
import { Pause, Play } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { getPlaylist, reorderPlaylist } from '../lib/api';
import { SiteLang } from '../lib/language';
import { usePlayerActions, usePlayerTransport } from '../providers/player-provider';
import { Playlist, PlaylistSummary } from '../types';
import { FavoriteButton, TrackPlaylistMenu } from './track-actions';

type PlaylistBrowserProps = {
  lang: SiteLang;
  playlistSummaries: PlaylistSummary[];
  initialPlaylist: Playlist | null;
  initialPlaylistId?: string;
};

function formatTrackDuration(durationRaw?: string | null, durationSec?: number | null) {
  if (durationRaw) {
    return durationRaw;
  }

  if (!durationSec || !Number.isFinite(durationSec)) {
    return '—';
  }

  const minutes = Math.floor(durationSec / 60);
  const seconds = durationSec % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
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

function PlaylistWaveform({
  tracks,
}: {
  tracks: Array<{
    id: string;
    title: string;
    artist: string;
    audioUrl: string;
    coverUrl: string;
    durationRaw?: string | null;
    durationSec?: number | null;
    waveformData: number[];
  }>;
}) {
  const { currentTrack } = usePlayerTransport();
  const { playQueueAtPercent, seekToPercent, getAudioElement } = usePlayerActions();
  const sourceTrack = tracks.find((track) => track.id === currentTrack?.id) || tracks.find((track) => track.waveformData.length) || tracks[0];
  const peaks = (sourceTrack?.waveformData.length
    ? sourceTrack.waveformData
    : buildFallbackWaveform(`${sourceTrack?.artist || ''}-${sourceTrack?.title || ''}`)).slice(0, 180);
  const [progressPercent, setProgressPercent] = useState(0);
  const currentTrackIndex = tracks.findIndex((track) => track.id === currentTrack?.id);
  const isCurrentPlaylistPlaying = currentTrackIndex >= 0;

  useEffect(() => {
    const audio = getAudioElement();
    if (!isCurrentPlaylistPlaying || !audio) {
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
  }, [currentTrackIndex, getAudioElement, isCurrentPlaylistPlaying]);

  function handleWaveSeek(event: React.MouseEvent<HTMLButtonElement>) {
    if (!tracks.length) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const percent = ((event.clientX - rect.left) / rect.width) * 100;
    const normalizedPercent = Math.max(0, Math.min(percent, 100));
    const audio = getAudioElement();

    if (isCurrentPlaylistPlaying && audio && Number.isFinite(audio.duration) && audio.duration > 0) {
      seekToPercent(normalizedPercent);
      return;
    }

    playQueueAtPercent(tracks, 0, normalizedPercent);
  }

  if (!tracks.length) {
    return null;
  }

  return (
    <div className="playlist-wave">
      <button
        type="button"
        className="library-wave__bars is-decoded playlist-wave__bars"
        onClick={handleWaveSeek}
        aria-label="Seek playlist waveform"
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

export function PlaylistBrowser({
  lang,
  playlistSummaries,
  initialPlaylist,
  initialPlaylistId,
}: PlaylistBrowserProps) {
  const [localSummaries, setLocalSummaries] = useState(playlistSummaries);
  const [playlistCache, setPlaylistCache] = useState<Record<string, Playlist>>(() =>
    initialPlaylist ? { [initialPlaylist.id]: initialPlaylist } : {},
  );
  const [activePlaylistId, setActivePlaylistId] = useState(
    initialPlaylistId || initialPlaylist?.id || playlistSummaries[0]?.id || '',
  );
  const [arePlaylistChipsExpanded, setArePlaylistChipsExpanded] = useState(false);
  const [draggedTrackId, setDraggedTrackId] = useState<string | null>(null);
  const [isReorderDirty, setIsReorderDirty] = useState(false);
  const [isPlaylistLoading, setIsPlaylistLoading] = useState(false);
  const { currentTrack, isPlaying } = usePlayerTransport();
  const { playQueue, togglePlayback } = usePlayerActions();
  const activePlaylist = activePlaylistId ? playlistCache[activePlaylistId] || null : null;

  useEffect(() => {
    setLocalSummaries(playlistSummaries);
    setActivePlaylistId(initialPlaylistId || initialPlaylist?.id || playlistSummaries[0]?.id || '');
    setPlaylistCache(initialPlaylist ? { [initialPlaylist.id]: initialPlaylist } : {});
  }, [initialPlaylist, initialPlaylistId, playlistSummaries]);

  useEffect(() => {
    if (!activePlaylistId || playlistCache[activePlaylistId]) {
      return;
    }

    let ignore = false;
    setIsPlaylistLoading(true);
    getPlaylist(activePlaylistId)
      .then((playlist) => {
        if (!ignore) {
          setPlaylistCache((current) => ({
            ...current,
            [playlist.id]: playlist,
          }));
        }
      })
      .finally(() => {
        if (!ignore) {
          setIsPlaylistLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [activePlaylistId, playlistCache]);

  const tracks = useMemo(() => {
    if (!activePlaylist) {
      return [];
    }

    return [...activePlaylist.items]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((item) => {
        const release = item.track.release;
        const audioUrl = item.track.audioFiles.find((file) => file.storageUrl)?.storageUrl || '';
        const coverUrl =
          release.coverThumbStorageUrl ||
          release.coverMediumStorageUrl ||
          release.coverStorageUrl ||
          release.coverImageUrl ||
          'https://placehold.co/120x120/png';

        return {
          id: item.track.id,
          title: item.track.title,
          artist: item.track.artists?.length ? item.track.artists.join(', ') : release.artist,
          audioUrl,
          coverUrl,
          durationRaw: item.track.durationRaw,
          durationSec: item.track.durationSec,
          bpm: item.track.bpm,
          waveformData: Array.isArray(item.track.waveformData)
            ? item.track.waveformData.filter((value): value is number => typeof value === 'number')
            : [],
          keyValue: item.track.key,
        };
      })
      .filter((track) => Boolean(track.audioUrl));
  }, [activePlaylist]);

  function playFromPlaylist(trackId: string) {
    const index = tracks.findIndex((track) => track.id === trackId);
    if (index < 0) {
      return;
    }

    playQueue(tracks, index);
  }

  function moveTrack(activeTrackId: string, overTrackId: string) {
    if (!activePlaylist || activeTrackId === overTrackId) {
      return;
    }

    const currentItems = [...activePlaylist.items].sort((a, b) => a.sortOrder - b.sortOrder);
    const fromIndex = currentItems.findIndex((item) => item.track.id === activeTrackId);
    const toIndex = currentItems.findIndex((item) => item.track.id === overTrackId);

    if (fromIndex < 0 || toIndex < 0) {
      return;
    }

    if (fromIndex === toIndex) {
      return;
    }

    const nextItems = [...currentItems];
    const [movedItem] = nextItems.splice(fromIndex, 1);
    nextItems.splice(toIndex, 0, movedItem);

    const reorderedItems = nextItems.map((item, index) => ({
      ...item,
      sortOrder: index,
    }));

    setPlaylistCache((current) => ({
      ...current,
      [activePlaylist.id]: {
        ...activePlaylist,
        items: reorderedItems,
      },
    }));
    setIsReorderDirty(true);
  }

  async function saveTrackOrder() {
    if (!activePlaylist || !isReorderDirty) {
      return;
    }

    const orderedTrackIds = [...activePlaylist.items]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((item) => item.track.id);

    try {
      const updatedPlaylist = await reorderPlaylist(activePlaylist.id, orderedTrackIds);
      setPlaylistCache((current) => ({
        ...current,
        [updatedPlaylist.id]: updatedPlaylist,
      }));
      setIsReorderDirty(false);
    } catch {
      if (initialPlaylist) {
        setPlaylistCache((current) => ({
          ...current,
          [initialPlaylist.id]: initialPlaylist,
        }));
      }
      setIsReorderDirty(false);
    }
  }

  return (
    <section className="playlists-page">
      <div className={`playlist-chip-row${arePlaylistChipsExpanded ? ' expanded' : ''}`}>
        {localSummaries.length ? (
          localSummaries.map((playlist) => (
            <button
              type="button"
              key={playlist.id}
              className={`playlist-chip${playlist.id === activePlaylist?.id ? ' active' : ''}`}
              onClick={() => setActivePlaylistId(playlist.id)}
            >
              <span>{playlist.name}</span>
              <small>{playlist._count.items}</small>
            </button>
          ))
        ) : (
          <p className="muted">
            {lang === 'ru' ? 'Плейлисты появятся здесь после создания.' : 'Playlists will appear here after creation.'}
          </p>
        )}
        {localSummaries.length > 6 ? (
          <button
            type="button"
            className="playlist-chip playlist-chip-toggle"
            onClick={() => setArePlaylistChipsExpanded((current) => !current)}
            aria-expanded={arePlaylistChipsExpanded}
          >
            ...
          </button>
        ) : null}
      </div>

      <PlaylistWaveform tracks={tracks} />

      <div className="playlist-feed">
        {isPlaylistLoading ? <p className="muted">Loading playlist...</p> : null}

        {activePlaylist ? (
          <div className="playlist-feed__header">
            <h1>{activePlaylist.name}</h1>
            <span className="muted">
              {lang === 'ru' ? `${tracks.length} треков` : `${tracks.length} tracks`}
            </span>
          </div>
        ) : null}

        <div className="playlist-tracklist">
          {tracks.map((track, index) => {
            const isCurrentTrack = currentTrack?.id === track.id;

            return (
              <div
                className={`playlist-track${isCurrentTrack ? ' active' : ''}${
                  draggedTrackId === track.id ? ' dragging' : ''
                }`}
                draggable
                key={track.id}
                onDragStart={(event) => {
                  setDraggedTrackId(track.id);
                  event.dataTransfer.effectAllowed = 'move';
                  event.dataTransfer.setData('text/plain', track.id);
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = 'move';
                  const activeTrackId = event.dataTransfer.getData('text/plain') || draggedTrackId;
                  if (activeTrackId) {
                    moveTrack(activeTrackId, track.id);
                  }
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  setDraggedTrackId(null);
                  void saveTrackOrder();
                }}
                onDragEnd={() => {
                  setDraggedTrackId(null);
                  void saveTrackOrder();
                }}
              >
                <button
                  type="button"
                  className="playlist-track__cover"
                  onClick={() => {
                    if (isCurrentTrack) {
                      togglePlayback();
                      return;
                    }

                    playFromPlaylist(track.id);
                  }}
                  aria-label={isCurrentTrack && isPlaying ? 'Pause' : 'Play'}
                >
                  <Image src={track.coverUrl} alt="" width={44} height={44} />
                  <span className="playlist-track__play">
                    {isCurrentTrack && isPlaying ? <Pause size={15} /> : <Play size={15} fill="currentColor" />}
                  </span>
                </button>

                <div className="playlist-track__number">{index + 1}</div>

                <button type="button" className="playlist-track__title" onClick={() => playFromPlaylist(track.id)}>
                  <span className="playlist-track__artist">{track.artist}</span>
                  <span> - {track.title}</span>
                </button>

                <div className="playlist-track__actions">
                  {track.bpm ? <span className="playlist-track__bpm">{track.bpm} BPM</span> : null}
                  {track.keyValue ? (
                    <span
                      className="playlist-track__key"
                      style={{ color: getKeyColor(track.keyValue) || undefined }}
                    >
                      {track.keyValue}
                    </span>
                  ) : null}
                  <FavoriteButton trackId={track.id} lang={lang} />
                  <TrackPlaylistMenu trackId={track.id} lang={lang} />
                </div>

                <div className="playlist-track__time muted">
                  {formatTrackDuration(track.durationRaw, track.durationSec)}
                </div>
              </div>
            );
          })}

          {activePlaylist && !tracks.length ? (
            <p className="muted">
              {lang === 'ru'
                ? 'В этом плейлисте пока нет треков с загруженным MP3.'
                : 'This playlist has no uploaded MP3 tracks yet.'}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
