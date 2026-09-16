'use client';

import Link from 'next/link';
import { Download, Pause, Play, Share2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { SiteLang } from '../lib/language';
import { HomeRelease, Release } from '../types';
import { usePlayerActions, usePlayerTransport } from '../providers/player-provider';
import { FavoriteButton, TrackPlaylistMenu } from './track-actions';
import { ShelfMixTrack } from './shelf-mix-track';
import { ShelfReleaseEditor } from './shelf-release-editor';
import { ShelfThemeToggle } from './shelf-theme-toggle';
import { LanguageSwitcher } from './language-switcher';
import './record-archive.css';
import './shelf-mix-detail.css';

export function ShelfMixDetail({ release, lang }: { release: Release; lang: SiteLang }) {
  const ru = lang === 'ru';
  const { playQueue, togglePlayback } = usePlayerActions();
  const { currentTrack, isPlaying } = usePlayerTransport();
  const [status, setStatus] = useState('');
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
      waveformData:track.waveformData || [], releaseId:release.id, isPublic:true }],0);
  }
  return <main className="shelf-mix-detail paper-section-page">
    <header className="shelf-mix-detail__header">
      <div className="paper-brand-row"><Link href="/">{ru ? 'Коллекция винила' : 'Vinyl collection'}</Link><ShelfThemeToggle iconOnly/><LanguageSwitcher lang={lang} single/></div>
      <Link href="/mixes">{ru ? 'Миксы' : 'Mixes'}</Link>
    </header>
    <article className="shelf-mix-detail__content">
      <button className="shelf-mix-detail__cover" onClick={play} disabled={!track?.audioUrl} aria-label={playing ? (ru?'Пауза':'Pause') : (ru?'Воспроизвести микс':'Play mix')}><img src={cover} alt={release.title}/></button>
      <section className="shelf-mix-detail__info">
        <ShelfReleaseEditor id={release.id} lang={lang} className="shelf-mix-edit-corner"/>
        <p className="shelf-mix-detail__artist">{release.artist}</p><h1>{release.title}</h1>
        <div className="shelf-mix-detail__actions">
          <button onClick={play} disabled={!track?.audioUrl} aria-label={playing ? (ru?'Пауза':'Pause') : 'Play'}>{playing ? <Pause size={22}/> : <Play size={22}/>}</button>
          {track ? <><FavoriteButton trackId={track.id} lang={lang}/><TrackPlaylistMenu trackId={track.id} lang={lang} align="up" sheetDrag/></> : null}
          {track?.audioUrl ? <a href={track.audioUrl} download aria-label={ru?'Скачать микс':'Download mix'}><Download size={18}/></a> : null}
          <button aria-label={ru?'Поделиться':'Share'} onClick={async()=>{
            try {
              if(navigator.share) await navigator.share({title:release.title,url:window.location.href});
              else {await navigator.clipboard.writeText(window.location.href);setStatus(ru?'Ссылка скопирована':'Link copied');}
            } catch(error) {if(!(error instanceof Error && error.name==='AbortError'))setStatus(ru?'Не удалось поделиться':'Unable to share');}
          }}><Share2 size={18}/></button>
        </div>
        <ShelfMixTrack release={mix} lang={lang} actions={null}/>
        {!track?.audioUrl ? <p className="muted">{ru?'Аудио ещё не загружено':'Audio is not available yet'}</p> : null}
        {status ? <p role="status">{status}</p> : null}
      </section>
    </article>
  </main>;
}
