'use client';

import { AudioLines, Disc3, Heart, Library, ListMusic } from 'lucide-react';
import type { PlayerTrack } from '../providers/player-provider';
import type { SiteLang } from '../lib/language';
import './mini-player-source.css';

const icons = {collection:Library, playlists:ListMusic, mixes:Disc3, originals:AudioLines, favorites:Heart};
export function MiniPlayerSource({track,lang}: {track:PlayerTrack;lang:SiteLang}) {
  const section = track.playbackSource?.section || (track.isOriginal ? 'originals' : track.isPublic ? 'mixes' : 'collection');
  const labels = lang === 'ru' ? {collection:'Коллекция',playlists:'Плейлисты',mixes:'Миксы',originals:'Tracks',favorites:'Избранное'} : {collection:'Collection',playlists:'Playlists',mixes:'Mixes',originals:'Tracks',favorites:'Favorites'};
  const Icon = icons[section];
  const label = section === 'playlists' && track.playbackSource?.name ? `${labels.playlists}: ${track.playbackSource.name}` : labels[section];
  return <span className="mini-player-source" data-source={section} tabIndex={0} role="img" aria-label={label} onClick={event=>event.stopPropagation()}>
    <Icon size={28} aria-hidden="true" />
    <span className="mini-player-source__tip" role="tooltip">{label}</span>
  </span>;
}
