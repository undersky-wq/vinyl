'use client';

import Image from 'next/image';
import { Pause, Play } from 'lucide-react';
import { SiteLang } from '../lib/language';
import { usePlayerActions, usePlayerTransport } from '../providers/player-provider';
import { Release, Track } from '../types';
import { FavoriteButton } from './track-actions';

type FavoriteTrack = Track & {
  release: Release;
};

type FavoritesBrowserProps = {
  lang: SiteLang;
  tracks: FavoriteTrack[];
  isLoggedIn: boolean;
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

export function FavoritesBrowser({ lang, tracks, isLoggedIn }: FavoritesBrowserProps) {
  const { currentTrack, isPlaying } = usePlayerTransport();
  const { playQueue, togglePlayback } = usePlayerActions();
  const playableTracks = tracks
    .map((track) => ({
      id: track.id,
      title: track.title,
      artist: track.artists?.length ? track.artists.join(', ') : track.release.artist,
      audioUrl: track.audioFiles.find((file) => file.storageUrl)?.storageUrl || '',
      coverUrl: getCoverUrl(track.release),
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
      <section className="favorites-page">
        <p className="muted">
          {lang === 'ru' ? 'Избранное доступно после входа.' : 'Favorites are available after sign in.'}
        </p>
      </section>
    );
  }

  return (
    <section className="favorites-page">
      <div className="playlist-feed__header favorites-page__header">
        <h1>{lang === 'ru' ? 'Избранное' : 'Favorites'}</h1>
        <span className="muted">
          {lang === 'ru' ? `${tracks.length} треков` : `${tracks.length} tracks`}
        </span>
      </div>

      <div className="playlist-tracklist favorites-tracklist">
        {tracks.map((track) => {
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

              <button type="button" className="playlist-track__title" onClick={() => playFavorite(track.id)}>
                <span className="playlist-track__artist">{artist}</span>
                <span>{track.title}</span>
              </button>

              <FavoriteButton trackId={track.id} lang={lang} alwaysVisible />

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
    </section>
  );
}
