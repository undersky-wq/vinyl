'use client';

import { useEffect, useState } from 'react';
import { SiteLang } from '../lib/language';
import { buildFallbackWaveform, useResponsiveWaveform } from '../lib/waveform';
import { usePlayerActions, usePlayerTransport } from '../providers/player-provider';
import { Release, Track } from '../types';
import { PlaylistTrackRow } from './playlist-track-row';

type FavoriteTrack = Track & {
  release: Release;
};

type FavoritePlayerTrack = {
  id: string;
  title: string;
  artist: string;
  audioUrl: string;
  coverUrl: string;
  durationRaw?: string | null;
  durationSec?: number | null;
  bpm?: number | null;
  keyValue?: string | null;
  waveformData: number[];
};

type FavoritesBrowserProps = {
  lang: SiteLang;
  tracks: FavoriteTrack[];
  isLoggedIn: boolean;
};

function getCoverUrl(release: Release) {
  return (
    release.coverThumbStorageUrl ||
    release.coverMediumStorageUrl ||
    release.coverStorageUrl ||
    release.coverImageUrl ||
    'https://placehold.co/120x120/png'
  );
}

function FavoritesWaveform({ tracks }: { tracks: FavoritePlayerTrack[] }) {
  const { currentTrack } = usePlayerTransport();
  const { getAudioElement, playQueueAtPercent, seekToPercent } = usePlayerActions();
  const sourceTrack =
    tracks.find((track) => track.id === currentTrack?.id) ||
    tracks.find((track) => track.waveformData.length) ||
    tracks[0];
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
  const isCurrentFavoritesPlaying = currentTrackIndex >= 0;

  useEffect(() => {
    const audio = getAudioElement();
    if (!isCurrentFavoritesPlaying || !audio) {
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
  }, [currentTrackIndex, getAudioElement, isCurrentFavoritesPlaying]);

  function handleWaveSeek(event: React.MouseEvent<HTMLButtonElement>) {
    if (!tracks.length) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const percent = ((event.clientX - rect.left) / rect.width) * 100;
    const normalizedPercent = Math.max(0, Math.min(percent, 100));
    const audio = getAudioElement();

    if (isCurrentFavoritesPlaying && audio && Number.isFinite(audio.duration) && audio.duration > 0) {
      seekToPercent(normalizedPercent);
      return;
    }

    playQueueAtPercent(tracks, 0, normalizedPercent);
  }

  if (!tracks.length) {
    return null;
  }

  return (
    <div className="playlist-wave favorites-wave">
      <button
        type="button"
        ref={waveformRef}
        className="library-wave__bars is-decoded playlist-wave__bars"
        onClick={handleWaveSeek}
        aria-label="Seek favourites waveform"
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
    </div>
  );
}

export function FavoritesBrowser({ lang, tracks, isLoggedIn }: FavoritesBrowserProps) {
  const { currentTrack, isPlaying } = usePlayerTransport();
  const { playQueue, togglePlayback } = usePlayerActions();
  const playableTracks: FavoritePlayerTrack[] = tracks
    .map((track) => ({
      id: track.id,
      title: track.title,
      artist: track.artists?.length ? track.artists.join(', ') : track.release.artist,
      audioUrl: track.audioFiles.find((file) => file.storageUrl)?.storageUrl || '',
      coverUrl: getCoverUrl(track.release),
      durationRaw: track.durationRaw,
      durationSec: track.durationSec,
      bpm: track.bpm,
      keyValue: track.key,
      waveformData: Array.isArray(track.waveformData)
        ? track.waveformData.filter((value): value is number => typeof value === 'number')
        : [],
    }))
    .filter((track) => Boolean(track.audioUrl));

  function playFavorite(trackId: string) {
    const index = playableTracks.findIndex((track) => track.id === trackId);
    if (index >= 0) {
      playQueue(playableTracks, index);
    }
  }

  if (!isLoggedIn) {
    return (
      <section className="favorites-page playlists-page">
        <p className="muted">
          {lang === 'ru' ? 'Избранное доступно после входа.' : 'Favourites are available after sign in.'}
        </p>
      </section>
    );
  }

  return (
    <section className="favorites-page playlists-page">
      <div className="playlist-feed__header favorites-page__header">
        <h1>{lang === 'ru' ? 'Избранное' : 'Favourites'}</h1>
        <span className="muted">
          {lang === 'ru' ? `${tracks.length} треков` : `${tracks.length} tracks`}
        </span>
      </div>

      <FavoritesWaveform tracks={playableTracks} />

      <div className="playlist-feed">
        <div className="playlist-tracklist favorites-tracklist">
          {tracks.map((track, index) => {
            const artist = track.artists?.length ? track.artists.join(', ') : track.release.artist;
            const audioUrl = track.audioFiles.find((file) => file.storageUrl)?.storageUrl || '';
            const coverUrl = getCoverUrl(track.release);
            const isCurrentTrack = currentTrack?.id === track.id;

            return (
              <PlaylistTrackRow
                lang={lang}
                trackId={track.id}
                title={track.title}
                artist={artist}
                coverUrl={coverUrl}
                indexLabel={index + 1}
                durationRaw={track.durationRaw}
                durationSec={track.durationSec}
                bpm={track.bpm}
                keyValue={track.key}
                isCurrentTrack={isCurrentTrack}
                isPlaying={isPlaying}
                className="favorites-track"
                disabled={!audioUrl}
                showPlaylistMenu={Boolean(audioUrl)}
                key={track.id}
                onPlay={() => {
                  if (isCurrentTrack) {
                    togglePlayback();
                    return;
                  }

                  playFavorite(track.id);
                }}
              />
            );
          })}

          {!tracks.length ? (
            <p className="muted">
              {lang === 'ru' ? 'Пока нет лайкнутых треков.' : 'No liked tracks yet.'}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
