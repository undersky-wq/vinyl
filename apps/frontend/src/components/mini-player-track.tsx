'use client';

import type { PlayerTrack } from '../providers/player-provider';
import type { SiteLang } from '../lib/language';
import { CoverImage } from './cover-image';
import { MiniPlayerSource } from './mini-player-source';
import './mini-player-track.css';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { MiniReleasePreview } from './mini-release-preview';
import { playingCoverImage } from '../lib/release-images';

export function MiniPlayerTrack({track, lang, onOpen}: {track:PlayerTrack;lang:SiteLang;onOpen:()=>void}) {
  const [preview, setPreview] = useState<PlayerTrack | null>(null);
  const reveal = () => setPreview(track);
  const artwork = playingCoverImage(track);
  return <div className="mini-player__track mini-track-transition">
    <button className="mini-track-transition__cover" type="button" aria-label={lang === 'ru' ? 'Открыть большой плеер' : 'Open full player'} onClick={event=>{event.stopPropagation();onOpen();}}>
      <CoverImage src={artwork.src} mobileSrc={artwork.mobileSrc} alt={track.title} width={58} height={58} loading="eager" />
    </button>
    <div className="mini-player__meta mini-track-transition__meta">
      <div key={track.id} className="mini-track-transition__labels">
        <button type="button" className="mini-player__artist" onClick={event=>{event.stopPropagation();reveal();}}>{track.artist}</button>
        <button type="button" className="mini-player__title" onClick={event=>{event.stopPropagation();reveal();}}>{track.title}</button>
      </div>
    </div>
    <MiniPlayerSource track={track} lang={lang} />
    {preview && createPortal(<MiniReleasePreview key={preview.releaseId} track={preview} lang={lang} onClose={()=>setPreview(null)} />,document.body)}
  </div>;
}
