'use client';

import type { PlayerTrack } from '../providers/player-provider';
import type { SiteLang } from '../lib/language';
import { CoverImage } from './cover-image';
import { MiniPlayerSource } from './mini-player-source';
import './mini-player-track.css';

export function MiniPlayerTrack({track, lang, onOpen}: {track:PlayerTrack;lang:SiteLang;onOpen:()=>void}) {
  return <div className="mini-player__track mini-track-transition">
    <button className="mini-track-transition__cover" type="button" aria-label={lang === 'ru' ? 'Открыть большой плеер' : 'Open full player'} onClick={event=>{event.stopPropagation();onOpen();}}>
      <CoverImage src={track.coverUrl} mobileSrc={track.coverSide === 'back' ? undefined : track.frontCoverMobileUrl} alt={track.title} width={58} height={58} loading="eager" />
    </button>
    <div className="mini-player__meta mini-track-transition__meta">
      <div key={track.id} className="mini-track-transition__labels">
        <div className="mini-player__artist">{track.artist}</div>
        <div className="mini-player__title">{track.title}</div>
      </div>
    </div>
    <MiniPlayerSource track={track} lang={lang} />
  </div>;
}
