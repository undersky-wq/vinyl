'use client';

import Image from 'next/image';
import { Pause, Play } from 'lucide-react';
import { useEffect, useState } from 'react';
import { SiteLang } from '../lib/language';
import { usePlayerActions, usePlayerTransport } from '../providers/player-provider';
import { Release, Track } from '../types';
import { FavoriteButton, TrackPlaylistMenu } from './track-actions';

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

function getCoverUrl(release: Release) {
  return (
    release.coverThumbStorageUrl ||
    release.coverMediumStorageUrl ||
    release.coverStorageUrl ||
    release.coverImageUrl ||
    'https://placehold.co/120x120/png'
  );
}

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

function FavoritesWaveform({ tracks }: { tracks: FavoritePlayerTrack[] }) {
  const { currentTrack } = usePlayerTransport();
  const { getAudioElement, playQueueAtPercent, seekToPercent } = usePlayerActions();
  const sourceTrack =
    tracks.find((track) => track.id === currentTrack?.id) ||
    tracks.find((track) => track.waveformData.length) ||
    tracks[0];
  const peaks = (sourceTrack?.waveformData.length
    ? sourceTrack.waveformData
    : buildFallbackWaveform(`${sourceTrack?.artist || ''}-${sourceTrack?.title || ''}`)).slice(0, 180);
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
              <div className={`playlist-track favorites-track${isCurrentTrack ? ' active' : ''}`} key={track.id}>
                <button
                  type="button"
                  className="playlist-track__cover"
                  disabled={!audioUrl}
                  onClick={() => {
                    if (isCurrentTrack) {
                      togglePlayback();
                      return;
                    }

                    playFavorite(track.id);
                  }}
                  aria-label={isCurrentTrack && isPlaying ? 'Pause' : 'Play'}
                >
                  <Image src={coverUrl} alt="" width={44} height={44} />
                  <span className="playlist-track__play">
                    {isCurrentTrack && isPlaying ? <Pause size={15} /> : <Play size={15} fill="currentColor" />}
                  </span>
                </button>

                <div className="playlist-track__number">{index + 1}</div>

                <button type="button" className="playlist-track__title" onClick={() => playFavorite(track.id)}>
                  <span className="playlist-track__artist">{artist}</span>
                  <span>{track.title}</span>
                </button>

                <div className="playlist-track__actions">
                  {track.bpm ? <span className="playlist-track__bpm">{track.bpm} BPM</span> : null}
                  {track.key ? (
                    <span className="playlist-track__key" style={{ color: getKeyColor(track.key) || undefined }}>
                      {track.key}
                    </span>
                  ) : null}
                  <FavoriteButton trackId={track.id} lang={lang} />
                  {audioUrl ? <TrackPlaylistMenu trackId={track.id} lang={lang} /> : null}
                </div>

                <div className="playlist-track__time muted">
                  {formatTrackDuration(track.durationRaw, track.durationSec)}
                </div>
              </div>
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
