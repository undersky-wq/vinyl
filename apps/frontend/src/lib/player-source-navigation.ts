import type { PlayerTrack } from '../providers/player-provider';
import type { SiteLang } from './language';

export function playerSourceNavigation(track: PlayerTrack, lang: SiteLang) {
  const source = track.playbackSource;
  const section = source?.section || (track.isOriginal ? 'originals' : track.isPublic ? 'mixes' : 'collection');
  const labels = lang === 'ru' ? {collection:'Коллекция',playlists:'Плейлисты',mixes:'Миксы',originals:'Треки',favorites:'Избранное'} : {collection:'Collection',playlists:'Playlists',mixes:'Mixes',originals:'Tracks',favorites:'Favorites'};
  const saved = new URL(source?.href || '/', 'https://player.local');
  const genres = new URLSearchParams(saved.hash.slice(1)).get('styles') || '';
  const search = saved.searchParams.get('search') || '';
  const filters = [genres.split(',').filter(Boolean).join(' + '), search ? `${lang === 'ru' ? 'Поиск' : 'Search'}: ${search}` : ''].filter(Boolean);
  const detail = section === 'playlists' ? source?.name : section === 'collection' ? filters.join('; ') || (lang === 'ru' ? 'Все жанры' : 'All genres') : '';
  const target = new URL(section === 'mixes' ? '/mixes' : section === 'originals' ? '/tracks' : section === 'favorites' ? '/favorites' : '/', saved.origin);
  target.searchParams.set('layout','tracks');
  if(section === 'playlists' && saved.searchParams.get('playlist'))target.searchParams.set('playlist',saved.searchParams.get('playlist')!);
  if(section === 'collection') {
    if(genres)target.hash = new URLSearchParams({styles:genres}).toString();
    if(search)target.searchParams.set('search',search);
  }
  target.searchParams.set('focusTrack',track.id);
  if(track.releaseId)target.searchParams.set('focusRelease',track.releaseId);
  return {section,label:labels[section]+(detail?`: ${detail}`:''),href:target.pathname+target.search+target.hash};
}
