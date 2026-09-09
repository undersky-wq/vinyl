'use client';

import Link from 'next/link';
import { CSSProperties, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
import { HomeRelease } from '../types';
import { PlayerTrack, usePlayerActions, usePlayerTransport } from '../providers/player-provider';
import { CoverArtwork } from './cover-artwork';

type JewelMotionStageProps = { releases: HomeRelease[] };

function coverFor(release: HomeRelease) {
  return release.coverMediumStorageUrl || release.coverThumbStorageUrl || release.coverStorageUrl || release.coverImageUrl || '';
}

function queueFor(release: HomeRelease): PlayerTrack[] {
  const coverUrl = coverFor(release);
  return release.tracks.filter((track) => Boolean(track.audioUrl)).map((track) => ({
    id: track.id, title: track.title, artist: release.artist, audioUrl: track.audioUrl,
    coverUrl, releaseId: release.id, waveformData: track.waveformData || [],
  }));
}

export function JewelMotionStage({ releases }: JewelMotionStageProps) {
  const collection = useMemo(() => [
    ...releases.filter((release) => release.tracks.some((track) => Boolean(track.audioUrl))),
    ...releases.filter((release) => !release.tracks.some((track) => Boolean(track.audioUrl))),
  ], [releases]);
  const [activeIndex, setActiveIndex] = useState(0);
  const release = collection[activeIndex] || releases[0];
  const queue = useMemo(() => release ? queueFor(release) : [], [release]);
  const { currentTrack, isPlaying } = usePlayerTransport();
  const { playQueue, togglePlayback } = usePlayerActions();
  const isCurrentRelease = Boolean(release && currentTrack?.releaseId === release.id);

  function move(direction: number) {
    if (!collection.length) return;
    setActiveIndex((current) => (current + direction + collection.length) % collection.length);
  }

  function toggleRelease() {
    if (!queue.length) return;
    if (isCurrentRelease) togglePlayback();
    else playQueue(queue, 0);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLElement>) {
    if (event.pointerType === 'touch') return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - .5;
    const y = (event.clientY - rect.top) / rect.height - .5;
    event.currentTarget.style.setProperty('--jewel-pointer-x', `${(x * 18).toFixed(2)}px`);
    event.currentTarget.style.setProperty('--jewel-pointer-y', `${(y * 12).toFixed(2)}px`);
  }

  if (!release) return null;

  return (
    <section className="home-stage home-stage--jewel" onPointerMove={handlePointerMove} aria-label="Mitya Dima physical music object">
      <div className="jewel-grain" aria-hidden="true" />
      <div className="jewel-light jewel-light--a" aria-hidden="true" />
      <div className="jewel-light jewel-light--b" aria-hidden="true" />

      <header className="jewel-nav">
        <Link href="/">MITYA / DIMA</Link>
        <nav aria-label="Main navigation">
          <Link href="/library">LIBRARY</Link><Link href="/playlists">PLAYLISTS</Link>
          <Link href="/mixes">MIXES</Link><Link href="/favorites">FAVORITES</Link>
        </nav>
        <span>{String(activeIndex + 1).padStart(2, '0')} / {String(collection.length).padStart(2, '0')}</span>
      </header>

      <div className="jewel-viewport" aria-hidden="true">
        <div className="jewel-camera" style={{ '--jewel-cover': `url("${coverFor(release)}")` } as CSSProperties}>
          <div className="jewel-case jewel-case--back">
            <span className="jewel-case__ridge jewel-case__ridge--top" /><span className="jewel-case__ridge jewel-case__ridge--bottom" />
            <span className="jewel-case__hinge jewel-case__hinge--a" /><span className="jewel-case__hinge jewel-case__hinge--b" />
            <div className="jewel-disc"><span className="jewel-disc__rings" /><span className="jewel-disc__label">MD<br />{String(activeIndex + 1).padStart(2, '0')}</span></div>
          </div>
          <div className="jewel-case jewel-case--front">
            <div className="jewel-artwork"><CoverArtwork src={coverFor(release)} alt="" sizes="90vw" priority /></div>
            <span className="jewel-case__ridge jewel-case__ridge--top" /><span className="jewel-case__ridge jewel-case__ridge--bottom" />
            <span className="jewel-case__hinge jewel-case__hinge--a" /><span className="jewel-case__hinge jewel-case__hinge--b" />
            <strong className="jewel-emboss">MITYA<br /><i>DIMA</i></strong>
          </div>
        </div>
      </div>

      <div className="jewel-release">
        <p><span>{release.artist}</span><span>{release.year || 'ARCHIVE'}</span></p><h1>{release.title}</h1>
        <div className="jewel-release__controls">
          <button type="button" onClick={() => move(-1)} aria-label="Previous release"><ChevronLeft /></button>
          <button type="button" className="jewel-release__play" onClick={toggleRelease} aria-label={isCurrentRelease && isPlaying ? 'Pause' : 'Play'}>
            {isCurrentRelease && isPlaying ? <Pause fill="currentColor" /> : <Play fill="currentColor" />}
          </button>
          <button type="button" onClick={() => move(1)} aria-label="Next release"><ChevronRight /></button>
        </div>
      </div>
      <div className="jewel-timeline" aria-hidden="true"><i /></div><span className="jewel-caption">PHYSICAL MUSIC / DIGITAL ARCHIVE</span>
    </section>
  );
}
