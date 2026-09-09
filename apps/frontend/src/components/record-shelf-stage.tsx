'use client';

import Link from 'next/link';
import { CSSProperties, useEffect, useMemo, useState } from 'react';
import { ArrowDownRight, Bookmark, HelpCircle, Pause, Play, Share2 } from 'lucide-react';
import { SiteLang } from '../lib/language';
import { PlayerTrack, usePlayerActions, usePlayerTransport } from '../providers/player-provider';
import { HomeRelease } from '../types';
import { CoverArtwork } from './cover-artwork';

type RecordShelfStageProps = {
  lang: SiteLang;
  releases: HomeRelease[];
};

function getCover(release: HomeRelease) {
  return (
    release.coverMediumStorageUrl ||
    release.coverThumbStorageUrl ||
    release.coverStorageUrl ||
    release.coverImageUrl ||
    'https://placehold.co/800x800/png'
  );
}

function toPlayerTracks(release: HomeRelease): PlayerTrack[] {
  const coverUrl = getCover(release);

  return release.tracks
    .filter((track) => Boolean(track.audioUrl))
    .map((track) => ({
      id: track.id,
      title: track.title,
      artist: release.artist,
      audioUrl: track.audioUrl,
      coverUrl,
      releaseId: release.id,
      waveformData: track.waveformData || [],
    }));
}

function ShelfStack({
  direction,
  releases,
  activeId,
  onSelect,
}: {
  direction: 'top' | 'bottom';
  releases: HomeRelease[];
  activeId: string | null;
  onSelect: (id: string, origin: 'top' | 'bottom') => void;
}) {
  return (
    <div className={`record-shelf__stack record-shelf__stack--${direction}`} aria-label="Record shelf">
      {releases.map((release, index) => (
        <button
          type="button"
          className={`record-shelf__sleeve${activeId === release.id ? ' is-active' : ''}`}
          style={{ '--record-index': index, '--record-z': `${index * 5}px`, '--record-count': releases.length } as CSSProperties}
          onClick={() => onSelect(release.id, direction)}
          aria-label={`${release.artist} — ${release.title}`}
          key={`${direction}-${release.id}`}
        >
          <CoverArtwork
            src={getCover(release)}
            alt=""
            sizes="(max-width: 640px) 22vw, 180px"
            priority={index < 5}
          />
          <span className="record-shelf__spine">{release.title}</span>
        </button>
      ))}
    </div>
  );
}

export function RecordShelfStage({ lang, releases }: RecordShelfStageProps) {
  const collection = useMemo(() => [
    ...releases.filter((release) => release.tracks.some((track) => Boolean(track.audioUrl))),
    ...releases.filter((release) => release.tracks.length > 0 && !release.tracks.some((track) => Boolean(track.audioUrl))),
    ...releases.filter((release) => release.tracks.length === 0),
  ].slice(0, 48), [releases]);
  const splitAt = Math.max(1, Math.ceil(collection.length / 2));
  const topRecords = collection.slice(0, splitAt);
  const bottomRecords = collection.slice(splitAt);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeOrigin, setActiveOrigin] = useState<'top' | 'bottom'>('top');
  const [clock, setClock] = useState<Date | null>(null);
  const { currentTrack, isPlaying } = usePlayerTransport();
  const { playQueue, togglePlayback } = usePlayerActions();

  useEffect(() => {
    setClock(new Date());
    const timer = window.setInterval(() => setClock(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const activeRelease = collection.find((release) => release.id === activeId) || null;
  const playableTracks = useMemo(
    () => (activeRelease ? toPlayerTracks(activeRelease) : []),
    [activeRelease],
  );

  function selectRelease(id: string, origin: 'top' | 'bottom') {
    setActiveOrigin(origin);
    setActiveId(id);
  }

  function playTrack(trackId: string) {
    const queueIndex = playableTracks.findIndex((track) => track.id === trackId);
    if (queueIndex < 0) return;

    if (currentTrack?.id === trackId && isPlaying) {
      togglePlayback();
      return;
    }

    playQueue(playableTracks, queueIndex);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLElement>) {
    if (event.pointerType === 'touch') return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width - 0.5) * 2;
    const y = ((event.clientY - bounds.top) / bounds.height - 0.5) * 2;
    event.currentTarget.style.setProperty('--shelf-x', `${(x * 10).toFixed(2)}px`);
    event.currentTarget.style.setProperty('--shelf-y', `${(y * 7).toFixed(2)}px`);
  }

  return (
    <section
      className={`home-stage home-stage--shelf${activeRelease ? ' has-selection' : ''}`}
      aria-labelledby="shelf-title"
      onPointerMove={handlePointerMove}
    >
      <header className="record-shelf__header">
        <span className="record-shelf__clock" suppressHydrationWarning>
          <b>{clock ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(clock) : '— —, —'}</b>
          <b>{clock ? clock.toLocaleTimeString('en-GB', { hour12: false }) : '00:00:00'}</b>
        </span>
        <h1 id="shelf-title">every : second</h1>
      </header>

      <ShelfStack direction="top" releases={topRecords} activeId={activeId} onSelect={selectRelease} />
      <ShelfStack direction="bottom" releases={bottomRecords} activeId={activeId} onSelect={selectRelease} />

      <div className="record-shelf__axis" aria-hidden="true">
        <span>ARCHIVE</span><i /><span>PLAY</span>
      </div>

      {activeRelease ? (
        <article className={`record-shelf__focus record-shelf__focus--from-${activeOrigin}`} key={activeRelease.id}>
          <div className="record-shelf__focus-cover">
            <CoverArtwork
              src={getCover(activeRelease)}
              alt={`${activeRelease.artist} — ${activeRelease.title}`}
              sizes="(max-width: 640px) 78vw, 42vw"
              priority
            />
            <span className="record-shelf__vinyl" aria-hidden="true"><i /></span>
          </div>

          <div className="record-shelf__details">
            <p className="record-shelf__kicker">
              <span>{activeRelease.year || 'UNDATED'}</span>
              <span>{activeRelease.styles.slice(0, 2).join(' / ') || 'VINYL'}</span>
            </p>
            <h2>{activeRelease.title}</h2>
            <p className="record-shelf__artist">{activeRelease.artist}</p>

            <ol className="record-shelf__tracks">
              {activeRelease.tracks.length ? activeRelease.tracks.map((track, index) => {
                const isCurrent = currentTrack?.id === track.id;
                const canPlay = playableTracks.some((item) => item.id === track.id);

                return (
                  <li className={isCurrent ? 'is-current' : ''} key={track.id}>
                    <button type="button" onClick={() => playTrack(track.id)} disabled={!canPlay}>
                      <span>{String(index + 1).padStart(2, '0')}</span>
                      <strong>{track.title}</strong>
                      <em>
                        {canPlay ? (
                          isCurrent && isPlaying ? <Pause size={13} fill="currentColor" /> : <Play size={13} fill="currentColor" />
                        ) : '—'}
                      </em>
                    </button>
                  </li>
                );
              }) : (
                <li className="record-shelf__empty">{lang === 'ru' ? 'Треклист не указан' : 'No tracklist supplied'}</li>
              )}
            </ol>

            <Link href={`/releases/${activeRelease.id}`} className="record-shelf__release-link">
              {lang === 'ru' ? 'Полная карточка релиза' : 'Full release notes'} <ArrowDownRight size={16} />
            </Link>
          </div>
        </article>
      ) : null}

      <aside className="record-shelf__index" aria-label="Archive index">
        <b>all <sup>{String(collection.length).padStart(3, '0')}</sup></b>
        <span>house <sup>12</sup></span>
        <span>disco <sup>09</sup></span>
        <span>electro <sup>07</sup></span>
        <span>mixes <sup>05</sup></span>
        <span>night <sup>03</sup></span>
        <span>2026 <sup>01</sup></span>
      </aside>

      <footer className="record-shelf__footer">
        <span className="record-shelf__utilities" aria-label="Utilities">
          <Bookmark size={14} />
          <Share2 size={14} />
          <HelpCircle size={15} />
        </span>
      </footer>
    </section>
  );
}
