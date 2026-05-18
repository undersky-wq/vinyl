'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { getPlaylist, reorderPlaylist, reorderPlaylists, updatePlaylist } from '../lib/api';
import { SiteLang } from '../lib/language';
import { buildFallbackWaveform, useResponsiveWaveform } from '../lib/waveform';
import { usePlayerActions, usePlayerTransport } from '../providers/player-provider';
import { Playlist, PlaylistSummary } from '../types';
import { PlaylistTrackRow } from './playlist-track-row';

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
  const sourcePeaks = sourceTrack?.waveformData.length
    ? sourceTrack.waveformData
    : buildFallbackWaveform(`${sourceTrack?.artist || ''}-${sourceTrack?.title || ''}`);
  const { ref: waveformRef, peaks } = useResponsiveWaveform(sourcePeaks, {
    minBars: 72,
    maxBars: 180,
    pixelsPerBar: 5,
  });
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
        ref={waveformRef}
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
  const localSummariesRef = useRef(playlistSummaries);
  const isPlaylistOrderDirtyRef = useRef(false);
  const [playlistCache, setPlaylistCache] = useState<Record<string, Playlist>>(() =>
    initialPlaylist ? { [initialPlaylist.id]: initialPlaylist } : {},
  );
  const [activePlaylistId, setActivePlaylistId] = useState(
    initialPlaylistId || initialPlaylist?.id || playlistSummaries[0]?.id || '',
  );
  const [draggedPlaylistId, setDraggedPlaylistId] = useState<string | null>(null);
  const [isPlaylistOrderDirty, setIsPlaylistOrderDirty] = useState(false);
  const [draggedTrackId, setDraggedTrackId] = useState<string | null>(null);
  const [isReorderDirty, setIsReorderDirty] = useState(false);
  const [isPlaylistLoading, setIsPlaylistLoading] = useState(false);
  const [editingPlaylistId, setEditingPlaylistId] = useState<string | null>(null);
  const [editingPlaylistName, setEditingPlaylistName] = useState('');
  const { currentTrack, isPlaying } = usePlayerTransport();
  const { playQueue, togglePlayback } = usePlayerActions();
  const activePlaylist = activePlaylistId ? playlistCache[activePlaylistId] || null : null;
  const visiblePlaylistSummaries = localSummaries;

  function selectPlaylist(playlistId: string) {
    setActivePlaylistId(playlistId);

    if (typeof window === 'undefined') {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    params.set('playlist', playlistId);
    window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`);
  }

  useEffect(() => {
    setLocalSummaries(playlistSummaries);
    localSummariesRef.current = playlistSummaries;
    isPlaylistOrderDirtyRef.current = false;
    setIsPlaylistOrderDirty(false);
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
          releaseId: release.id,
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

  function movePlaylist(activePlaylistChipId: string, overPlaylistChipId: string) {
    if (activePlaylistChipId === overPlaylistChipId) {
      return;
    }

    const fromIndex = localSummaries.findIndex((playlist) => playlist.id === activePlaylistChipId);
    const toIndex = localSummaries.findIndex((playlist) => playlist.id === overPlaylistChipId);

    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) {
      return;
    }

    const nextSummaries = [...localSummaries];
    const [movedPlaylist] = nextSummaries.splice(fromIndex, 1);
    nextSummaries.splice(toIndex, 0, movedPlaylist);
    localSummariesRef.current = nextSummaries;
    isPlaylistOrderDirtyRef.current = true;
    setLocalSummaries(nextSummaries);
    setIsPlaylistOrderDirty(true);
  }

  async function savePlaylistOrder() {
    if (!isPlaylistOrderDirtyRef.current) {
      return;
    }

    const orderedPlaylistIds = localSummariesRef.current.map((playlist) => playlist.id);
    try {
      const updatedSummaries = await reorderPlaylists(orderedPlaylistIds);
      localSummariesRef.current = updatedSummaries;
      isPlaylistOrderDirtyRef.current = false;
      setLocalSummaries(updatedSummaries);
      setIsPlaylistOrderDirty(false);
    } catch {
      localSummariesRef.current = playlistSummaries;
      isPlaylistOrderDirtyRef.current = false;
      setLocalSummaries(playlistSummaries);
      setIsPlaylistOrderDirty(false);
    }
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

  async function savePlaylistName() {
    if (!editingPlaylistId || !editingPlaylistName.trim()) {
      setEditingPlaylistId(null);
      return;
    }

    const nextName = editingPlaylistName.trim();

    try {
      const updatedPlaylist = await updatePlaylist(editingPlaylistId, { name: nextName });
      setPlaylistCache((current) => ({
        ...current,
        [updatedPlaylist.id]: updatedPlaylist,
      }));
      setLocalSummaries((current) =>
        current.map((summary) =>
          summary.id === updatedPlaylist.id
            ? {
                ...summary,
                name: updatedPlaylist.name,
              }
            : summary,
        ),
      );
    } finally {
      setEditingPlaylistId(null);
      setEditingPlaylistName('');
    }
  }

  function startRenamePlaylist(playlist: PlaylistSummary | Playlist) {
    setEditingPlaylistId(playlist.id);
    setEditingPlaylistName(playlist.name);
  }

  return (
    <section className="playlists-page">
      <div className="playlist-chip-row">
        {visiblePlaylistSummaries.length ? (
          visiblePlaylistSummaries.map((playlist) => (
            <div
              key={playlist.id}
              className={`playlist-chip${playlist.id === activePlaylist?.id ? ' active' : ''}${
                draggedPlaylistId === playlist.id ? ' dragging' : ''
              }`}
              draggable
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/plain', playlist.id);
                setDraggedPlaylistId(playlist.id);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
                const activePlaylistChipId = event.dataTransfer.getData('text/plain') || draggedPlaylistId;
                if (activePlaylistChipId) {
                  movePlaylist(activePlaylistChipId, playlist.id);
                }
              }}
              onDrop={(event) => {
                event.preventDefault();
                setDraggedPlaylistId(null);
                void savePlaylistOrder();
              }}
              onDragEnd={() => {
                setDraggedPlaylistId(null);
                void savePlaylistOrder();
              }}
            >
              <button type="button" className="playlist-chip__select" onClick={() => selectPlaylist(playlist.id)}>
                <span>{playlist.name}</span>
                <small>{playlist._count.items}</small>
              </button>
            </div>
          ))
        ) : (
          <p className="muted">
            {lang === 'ru' ? 'Плейлисты появятся здесь после создания.' : 'Playlists will appear here after creation.'}
          </p>
        )}
      </div>

      <PlaylistWaveform tracks={tracks} />

      <div className="playlist-feed">
        {isPlaylistLoading ? <p className="muted">Loading playlist...</p> : null}

        {activePlaylist ? (
          <div className="playlist-feed__header">
            {editingPlaylistId === activePlaylist.id ? (
              <input
                autoFocus
                className="playlist-title-input"
                value={editingPlaylistName}
                onChange={(event) => setEditingPlaylistName(event.target.value)}
                onBlur={() => void savePlaylistName()}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    void savePlaylistName();
                  }
                  if (event.key === 'Escape') {
                    setEditingPlaylistId(null);
                    setEditingPlaylistName('');
                  }
                }}
              />
            ) : (
              <h1>{activePlaylist.name}</h1>
            )}
            <span className="muted">
              {lang === 'ru' ? `${tracks.length} треков` : `${tracks.length} tracks`}
            </span>
            <button
              type="button"
              className="playlist-title-rename"
              onClick={() => startRenamePlaylist(activePlaylist)}
            >
              {lang === 'ru' ? 'Переименовать' : 'Rename'}
            </button>
          </div>
        ) : null}

        <div className="playlist-tracklist">
          {tracks.map((track, index) => {
            const isCurrentTrack = currentTrack?.id === track.id;

            return (
              <PlaylistTrackRow
                lang={lang}
                trackId={track.id}
                title={track.title}
                artist={track.artist}
                coverUrl={track.coverUrl}
                indexLabel={index + 1}
                durationRaw={track.durationRaw}
                durationSec={track.durationSec}
                bpm={track.bpm}
                keyValue={track.keyValue}
                isCurrentTrack={isCurrentTrack}
                isPlaying={isPlaying}
                isDragging={draggedTrackId === track.id}
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
                onPlay={() => {
                  if (isCurrentTrack) {
                    togglePlayback();
                    return;
                  }

                  playFromPlaylist(track.id);
                }}
              />
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
