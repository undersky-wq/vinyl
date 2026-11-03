'use client';

import { AudioLines, Disc3, Heart, Library, ListMusic } from 'lucide-react';
import type { PlayerTrack } from '../providers/player-provider';
import type { SiteLang } from '../lib/language';
import './mini-player-source.css';
import { useRouter } from 'next/navigation';
import { usePlayerTransport } from '../providers/player-provider';
import { playerSourceNavigation } from '../lib/player-source-navigation';
import { usePlaylists } from '../providers/playlists-provider';

const icons = {collection:Library, playlists:ListMusic, mixes:Disc3, originals:AudioLines, favorites:Heart};
export function MiniPlayerSource({track,lang}: {track:PlayerTrack;lang:SiteLang}) {
  const router = useRouter();
  const {queue} = usePlayerTransport();
  const {playlists} = usePlaylists();
  let latest = queue.find(item=>item.id===track.id) || track;
  if(latest.playbackSource?.section==='playlists'){
    const saved = new URL(latest.playbackSource.href || '/', 'https://player.local');
    if(!saved.searchParams.has('playlist')){
      const playlist=playlists.find(p=>p.name===latest.playbackSource?.name && p.items.some(item=>item.track.id===track.id));
      if(playlist){saved.searchParams.set('playlist',playlist.id);latest={...latest,playbackSource:{...latest.playbackSource,href:saved.pathname+saved.search+saved.hash}};}
    }
  }
  const {section,label,href} = playerSourceNavigation(latest,lang);
  const Icon = icons[section];
  return <button type="button" className="mini-player-source" data-source={section} aria-label={label} onClick={event=>{event.stopPropagation();router.push(href,{scroll:false});}}>
    <Icon size={28} aria-hidden="true" />
    <span className="mini-player-source__tip" role="tooltip">{label}</span>
  </button>;
}
