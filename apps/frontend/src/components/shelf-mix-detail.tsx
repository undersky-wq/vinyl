'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AudioLines, Disc3, Heart, Library, ListMusic } from 'lucide-react';
import { SiteLang } from '../lib/language';
import { HomeRelease, Release } from '../types';
import { usePlayerActions, usePlayerTransport } from '../providers/player-provider';
import { ShelfMixTrack } from './shelf-mix-track';
import { ShelfReleaseEditor } from './shelf-release-editor';
import { ArchivePageHeader } from './archive-page-header';
import { useCollectionCounts } from './use-collection-counts';
import './record-archive.css';
import './shelf-mix-detail.css';

export function ShelfMixDetail({ release, lang }: { release: Release; lang: SiteLang }) {
  const router = useRouter();
  const counts = useCollectionCounts();
  const [search, setSearch] = useState('');
  const [uiLang, setUiLang] = useState(lang);
  useEffect(() => setUiLang(lang), [lang]);
  useEffect(() => {
    const update = (event: Event) => setUiLang((event as CustomEvent<SiteLang>).detail);
    window.addEventListener('vinyl:language-change', update);
    return () => window.removeEventListener('vinyl:language-change', update);
  }, []);
  const ru = uiLang === 'ru';
  const sectionPath = release.isOriginal ? '/tracks' : '/mixes';
  const { playQueue, togglePlayback } = usePlayerActions();
  const { currentTrack, isPlaying } = usePlayerTransport();
  const mix = useMemo<HomeRelease>(() => ({ ...release, tracks: release.tracks.map(track => ({
    ...track, audioUrl: track.audioFiles.find(file => file.normalizedStorageUrl)?.normalizedStorageUrl
      || track.audioFiles.find(file => file.storageUrl)?.storageUrl || '',
  })) }), [release]);
  const track = mix.tracks.find(item => item.audioUrl) || mix.tracks[0];
  const cover = release.coverStorageUrl || release.coverImageUrl || release.coverMediumStorageUrl || '/icon.png';
  const playing = currentTrack?.releaseId === release.id && isPlaying;
  function play() {
    if (!track?.audioUrl) return;
    if (currentTrack?.id === track.id) { togglePlayback(); return; }
    playQueue([{ ...track, artist:release.artist, coverUrl:cover, coverFullUrl:cover,
      waveformData:track.waveformData || [], releaseId:release.id, isPublic:true, isOriginal:release.isOriginal }],0);
  }
  return <main className="shelf-mix-detail paper-section-page" data-music-section={release.isOriginal ? 'originals' : 'mixes'}>
    <header className="paper-header shelf-mix-detail__header">
      <ArchivePageHeader lang={uiLang} search={search} onSearchChange={setSearch} onSearchSubmit={() => router.push(`/?search=${encodeURIComponent(search)}`)} onHome={() => router.push('/')} activeLayout={null} onLayoutChange={layout => router.push(`${sectionPath}?layout=${layout}`)} />
    </header>
    <nav className="paper-sections shelf-mix-detail__sections" aria-label="Collection sections">
      <Link href="/" className="paper-section-collection" aria-label={ru ? 'Коллекция' : 'Collection'}><Library size={17}/><span><span className="shelf-mix-detail__section-label">{ru ? 'Коллекция' : 'Collection'}</span> <sup>{counts.releases}</sup></span></Link>
      <Link href="/?view=playlists" aria-label={ru ? 'Плейлисты' : 'Playlists'}><ListMusic size={17}/><span><span className="shelf-mix-detail__section-label">{ru ? 'Плейлисты' : 'Playlists'}</span> <sup>{counts.playlists}</sup></span></Link>
      <Link href="/mixes" className="paper-section-mixes" aria-label={ru ? 'Миксы' : 'Mixes'} aria-current={!release.isOriginal ? 'page' : undefined}><Disc3 size={17}/><span><span className="shelf-mix-detail__section-label">{ru ? 'Миксы' : 'Mixes'}</span> <sup>{counts.mixes}</sup></span></Link>
      <Link href="/tracks" className="paper-section-originals" aria-label={ru ? 'Треки' : 'Tracks'} aria-current={release.isOriginal ? 'page' : undefined}><AudioLines size={17}/><span><span className="shelf-mix-detail__section-label">{ru ? 'Треки' : 'Tracks'}</span> <sup>{counts.originals}</sup></span></Link>
      <Link href="/favorites" className="paper-section-favorites" aria-label={ru ? 'Избранное' : 'Favorites'}><Heart size={17}/><span><span className="shelf-mix-detail__section-label">{ru ? 'Избранное' : 'Favorites'}</span> <sup>{counts.favorites}</sup></span></Link>
    </nav>
    <article className="shelf-mix-detail__content">
      <button className="shelf-mix-detail__cover" onClick={play} disabled={!track?.audioUrl} aria-label={playing ? (ru?'Пауза':'Pause') : release.isOriginal ? (ru?'Воспроизвести трек':'Play track') : (ru?'Воспроизвести микс':'Play mix')}><img src={cover} alt={release.title}/></button>
      <section className="shelf-mix-detail__info">
        <ShelfReleaseEditor id={release.id} lang={uiLang} className="shelf-mix-edit-corner"/>
        <ShelfMixTrack release={mix} lang={uiLang} actions={null} yearInHeading timelineControls commentsAlwaysOpen />
        {!track?.audioUrl ? <p className="muted">{ru?'Аудио ещё не загружено':'Audio is not available yet'}</p> : null}
      </section>
    </article>
  </main>;
}
