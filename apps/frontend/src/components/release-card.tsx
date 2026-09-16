'use client';

import Link from 'next/link';
import { Play } from 'lucide-react';
import { CoverArtwork } from './cover-artwork';
import { useAuth } from '../providers/auth-provider';
import { PlayerTrack, usePlayerActions } from '../providers/player-provider';
import { HomeRelease } from '../types';
import { useDesignVariant } from './design-variant-switcher';

type ReleaseCardProps = {
  release: HomeRelease;
  onOpenRelease?: () => void;
  priority?: boolean;
  index?: number;
};

export function ReleaseCard({ release, onOpenRelease, priority = false, index = 0 }: ReleaseCardProps) {
  const { variant } = useDesignVariant();
  const { user, requireAuth } = useAuth();
  const { playQueue } = usePlayerActions();
  const coverSrc = release.coverThumbStorageUrl || release.coverMediumStorageUrl || release.coverStorageUrl || release.coverImageUrl || 'https://placehold.co/800x800/png';
  const playableTracks: PlayerTrack[] = release.tracks
    .map((track): PlayerTrack | null => track.audioUrl ? ({
      id: track.id,
      title: track.title,
      artist: release.artist,
      audioUrl: track.audioUrl,
      coverUrl: coverSrc,
      releaseId: release.id,
      waveformData: track.waveformData || [],
    }) : null)
    .filter((track): track is PlayerTrack => Boolean(track));

  function playRelease() {
    if (playableTracks.length) playQueue(playableTracks, 0);
    else requireAuth();
  }

  function handlePlay(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    playRelease();
  }

  if (variant === 'shelf') {
    return (
      <article className="release-card release-card--shelf">
        <span className="shelf-release__number">{String(index + 1).padStart(2, '0')}</span>
        <Link href={`/releases/${release.id}`} className="shelf-release__cover" aria-label={`${release.artist} — ${release.title}`} onClick={onOpenRelease}>
          <CoverArtwork src={coverSrc} alt={release.title} priority={priority} grayscale={user?.role === 'ADMIN' && release.audioComplete === false} />
        </Link>
        <div className="shelf-release__identity"><h3>{release.title}</h3><p>{release.artist}</p></div>
        <span className="shelf-release__tracks">{String(release.tracks.length).padStart(2, '0')} TRK</span>
        <span className="shelf-release__year">{release.year || '—'}</span>
        <button type="button" className="shelf-release__play" onClick={handlePlay} aria-label="Play"><Play size={14} fill="currentColor" /></button>
      </article>
    );
  }

  return (
    <div className="release-card">
      <div className="cover-frame">
        <Link href={`/releases/${release.id}`} aria-label={`${release.artist} — ${release.title}`} className="cover-link" onClick={onOpenRelease}>
          <CoverArtwork src={coverSrc} alt={release.title} priority={priority} grayscale={user?.role === 'ADMIN' && release.audioComplete === false} />
        </Link>
        <div className="cover-overlay">
          <button type="button" className="cover-play-button" aria-label="Play" onClick={handlePlay}>
            <Play size={24} fill="currentColor" />
          </button>
        </div>
      </div>
      <div className="release-meta">
        <h3 className="release-title">{release.title}</h3>
        <p className="release-subtitle">{release.artist}{release.year ? ` • ${release.year}` : ''}</p>
      </div>
    </div>
  );
}
