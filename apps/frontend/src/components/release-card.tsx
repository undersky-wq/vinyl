'use client';

import Link from 'next/link';
import { Play } from 'lucide-react';
import { CoverArtwork } from './cover-artwork';
import { useAuth } from '../providers/auth-provider';
import { PlayerTrack, usePlayerActions } from '../providers/player-provider';
import { HomeRelease } from '../types';

type ReleaseCardProps = {
  release: HomeRelease;
  onOpenRelease?: () => void;
  priority?: boolean;
  index?: number;
};

export function ReleaseCard({ release, onOpenRelease, priority = false, index = 0 }: ReleaseCardProps) {
  const { requireAuth } = useAuth();
  const { playQueue } = usePlayerActions();
  const coverSrc = release.coverThumbStorageUrl || release.coverMediumStorageUrl || release.coverStorageUrl || release.coverImageUrl || 'https://placehold.co/800x800/png';
  const playableTracks: PlayerTrack[] = release.tracks.flatMap(track => track.audioUrl ? [{
    id: track.id,
    title: track.title,
    artist: release.artist,
    audioUrl: track.audioUrl,
    coverUrl: coverSrc,
    releaseId: release.id,
    waveformData: track.waveformData || [],
  }] : []);

  function handlePlay(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (playableTracks.length) playQueue(playableTracks, 0);
    else requireAuth();
  }

  const number = String(index + 1).padStart(2, '0');
  return <article className="release-card release-card--shelf">
    <span className="shelf-release__number">{number}</span>
    <Link href={`/releases/${release.id}`} className="shelf-release__cover" aria-label={`${release.artist} — ${release.title}`} onClick={onOpenRelease}>
      <CoverArtwork src={coverSrc} alt={release.title} priority={priority} />
    </Link>
    <div className="shelf-release__identity"><h3>{release.title}</h3><p>{release.artist}</p></div>
    <span className="shelf-release__tracks">{String(release.tracks.length).padStart(2, '0')} TRK</span>
    <span className="shelf-release__year">{release.year || '—'}</span>
    <button type="button" className="shelf-release__play" onClick={handlePlay} aria-label="Play"><Play size={14} fill="currentColor" /></button>
  </article>;
}
