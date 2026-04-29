'use client';

import Link from 'next/link';
import { Play } from 'lucide-react';
import { CoverArtwork } from './cover-artwork';
import { useAuth } from '../providers/auth-provider';
import { PlayerTrack, usePlayerActions } from '../providers/player-provider';
import { HomeRelease } from '../types';

type ReleaseCardProps = {
  release: HomeRelease;
};

export function ReleaseCard({ release }: ReleaseCardProps) {
  const { requireAuth } = useAuth();
  const { playQueue } = usePlayerActions();
  const coverSrc =
    release.coverThumbStorageUrl ||
    release.coverMediumStorageUrl ||
    release.coverStorageUrl ||
    release.coverImageUrl ||
    'https://placehold.co/800x800/png';

  const playableTracks: PlayerTrack[] = release.tracks
    .map((track) => {
      if (!track.audioUrl) {
        return null;
      }

      return {
        id: track.id,
        title: track.title,
        artist: release.artist,
        audioUrl: track.audioUrl,
        coverUrl: coverSrc,
      };
    })
    .filter((track): track is PlayerTrack => Boolean(track));

  return (
    <div className="release-card">
      <div className="cover-frame">
        <Link
          href={`/releases/${release.id}`}
          aria-label={`${release.artist} — ${release.title}`}
          className="cover-link"
        >
          <CoverArtwork src={coverSrc} alt={release.title} />
        </Link>

        <div className="cover-overlay">
          <button
            type="button"
            className="cover-play-button"
            aria-label="Play"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (playableTracks.length) {
                playQueue(playableTracks, 0);
              } else {
                requireAuth();
              }
            }}
          >
            <Play size={24} fill="currentColor" />
          </button>
        </div>
      </div>

      <div className="release-meta">
        <h3 className="release-title">{release.title}</h3>
        <p className="release-subtitle">
          {release.artist}
          {release.year ? ` • ${release.year}` : ''}
        </p>
      </div>
    </div>
  );
}
