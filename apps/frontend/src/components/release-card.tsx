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
  const { requireAuth } = useAuth();
  const { playQueue } = usePlayerActions();
  const coverSrc =
    release.coverThumbStorageUrl ||
    release.coverMediumStorageUrl ||
    release.coverStorageUrl ||
    release.coverImageUrl ||
    'https://placehold.co/800x800/png';

  const playableTracks: PlayerTrack[] = release.tracks
    .map((track): PlayerTrack | null => {
      if (!track.audioUrl) {
        return null;
      }

      return {
        id: track.id,
        title: track.title,
        artist: release.artist,
        audioUrl: track.audioUrl,
        coverUrl: coverSrc,
        releaseId: release.id,
        waveformData: track.waveformData || [],
      };
    })
    .filter((track): track is PlayerTrack => Boolean(track));

  function playRelease() {
    if (playableTracks.length) {
      playQueue(playableTracks, 0);
      return;
    }

    requireAuth();
  }

  function handlePlay(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    playRelease();
  }

  const number = String(index + 1).padStart(2, '0');
  const releaseHref = `/releases/${release.id}`;

  if (variant === 'xerox') {
    return (
      <article className="release-card release-card--xerox">
        <header className="xerox-release__header"><span>FILE / {number}</span><b>{release.year || '—'}</b></header>
        <div className="xerox-release__sheet">
          <Link href={releaseHref} aria-label={`${release.artist} — ${release.title}`} onClick={onOpenRelease}>
            <CoverArtwork src={coverSrc} alt={release.title} priority={priority} />
          </Link>
          <button type="button" className="xerox-release__play" onClick={handlePlay}><Play size={15} fill="currentColor" /> LISTEN</button>
        </div>
        <footer className="xerox-release__caption">
          <span>{release.styles.slice(0, 2).join(' / ') || 'VINYL'}</span>
          <h3>{release.title}</h3>
          <p>{release.artist}</p>
        </footer>
      </article>
    );
  }

  if (variant === 'acid') {
    return (
      <article className="release-card release-card--acid">
        <div className="acid-release__vinyl">
          <span className="acid-release__grooves" aria-hidden="true" />
          <Link href={releaseHref} className="acid-release__cover" aria-label={`${release.artist} — ${release.title}`} onClick={onOpenRelease}>
            <CoverArtwork src={coverSrc} alt={release.title} priority={priority} />
          </Link>
          <button type="button" className="acid-release__play" onClick={handlePlay} aria-label="Play"><Play size={22} fill="currentColor" /></button>
        </div>
        <div className="acid-release__ticker"><span>ON AIR</span><b>{number}</b><span>{release.styles[0] || 'VINYL'}</span></div>
        <h3>{release.title}</h3>
        <p>{release.artist} / {release.year || '—'}</p>
      </article>
    );
  }

  if (variant === 'chrome') {
    return (
      <article className="release-card release-card--chrome">
        <div className="chrome-release__rail"><span>{number}</span><i /><small>MD–AUDIO</small></div>
        <Link href={releaseHref} className="chrome-release__media" aria-label={`${release.artist} — ${release.title}`} onClick={onOpenRelease}>
          <CoverArtwork src={coverSrc} alt={release.title} priority={priority} />
          <span className="chrome-release__scanner" aria-hidden="true" />
        </Link>
        <div className="chrome-release__data">
          <span>{release.styles[0] || 'AUDIO OBJECT'}</span>
          <h3>{release.title}</h3>
          <p>{release.artist} · {release.year || '—'}</p>
          <button type="button" onClick={handlePlay}><Play size={16} fill="currentColor" /> EXECUTE</button>
        </div>
      </article>
    );
  }

  if (variant === 'grid') {
    return (
      <article className="release-card release-card--index">
        <span className="index-release__number">{number}</span>
        <Link href={releaseHref} className="index-release__cover" aria-label={`${release.artist} — ${release.title}`} onClick={onOpenRelease}>
          <CoverArtwork src={coverSrc} alt={release.title} priority={priority} />
        </Link>
        <div className="index-release__identity"><h3>{release.title}</h3><p>{release.artist}</p></div>
        <span className="index-release__style">{release.styles[0] || 'VINYL'}</span>
        <span className="index-release__year">{release.year || '—'}</span>
        <button type="button" className="index-release__play" onClick={handlePlay}><Play size={15} fill="currentColor" /><span>PLAY</span></button>
      </article>
    );
  }

  if (variant === 'nocturne') {
    return (
      <article className="release-card release-card--nocturne">
        <figure>
          <Link href={releaseHref} aria-label={`${release.artist} — ${release.title}`} onClick={onOpenRelease}>
            <CoverArtwork src={coverSrc} alt={release.title} priority={priority} />
          </Link>
          <button type="button" className="nocturne-release__play" onClick={handlePlay}><Play size={17} fill="currentColor" /> ÉCOUTER</button>
          <figcaption><span>Plate {number}</span><span>{release.year || 'Undated'}</span></figcaption>
        </figure>
        <div className="nocturne-release__copy">
          <p>{release.styles.slice(0, 2).join(' · ') || 'Selected recording'}</p>
          <h3>{release.title}</h3>
          <span>{release.artist}</span>
        </div>
      </article>
    );
  }

  if (variant === 'shelf') {
    return (
      <article className="release-card release-card--shelf">
        <span className="shelf-release__number">{number}</span>
        <Link href={releaseHref} className="shelf-release__cover" aria-label={`${release.artist} — ${release.title}`} onClick={onOpenRelease}>
          <CoverArtwork src={coverSrc} alt={release.title} priority={priority} />
        </Link>
        <div className="shelf-release__identity">
          <h3>{release.title}</h3>
          <p>{release.artist}</p>
        </div>
        <span className="shelf-release__tracks">{String(release.tracks.length).padStart(2, '0')} TRK</span>
        <span className="shelf-release__year">{release.year || '—'}</span>
        <button type="button" className="shelf-release__play" onClick={handlePlay} aria-label="Play">
          <Play size={14} fill="currentColor" />
        </button>
      </article>
    );
  }

  return (
    <div className="release-card">
      <span className="release-card__number" aria-hidden="true">{number}</span>
      <div className="cover-frame">
        <Link
          href={`/releases/${release.id}`}
          aria-label={`${release.artist} — ${release.title}`}
          className="cover-link"
          onClick={onOpenRelease}
        >
          <CoverArtwork src={coverSrc} alt={release.title} priority={priority} />
        </Link>

        <div className="cover-overlay">
          <button
            type="button"
            className="cover-play-button"
            aria-label="Play"
            onClick={handlePlay}
          >
            <Play size={24} fill="currentColor" />
            <span>PLAY</span>
          </button>
        </div>
      </div>

      <div className="release-meta">
        <span className="release-meta__style">{release.styles[0] || 'VINYL'}</span>
        <h3 className="release-title">{release.title}</h3>
        <p className="release-subtitle">
          {release.artist}
          {release.year ? ` • ${release.year}` : ''}
        </p>
      </div>
    </div>
  );
}
