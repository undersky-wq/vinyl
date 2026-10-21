'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AudioLines, Check, Disc3, Heart, Library, ListMusic, X } from 'lucide-react';
import './mobile-collection-picker.css';

export type MobileCollectionSection = 'collection' | 'playlists' | 'mixes' | 'originals' | 'favorites';
const sectionIcons = { collection: Library, playlists: ListMusic, mixes: Disc3, originals: AudioLines, favorites: Heart };
type Props = {
  kind: 'sections' | 'genres' | 'playlists' | 'music' | null;
  music: { id: string; artist: string; title: string }[];
  onMusic: (id: string) => void;
  ru: boolean;
  section: MobileCollectionSection;
  sections: { key: MobileCollectionSection; label: string; count: number | string }[];
  genres: [string, number][];
  selectedGenres: string[];
  playlists: { id: string; name: string; count: number }[];
  selectedPlaylist: string | null;
  maxGenres: number;
  onClose: () => void;
  onSection: (section: MobileCollectionSection) => void;
  onGenres: (styles: string[]) => void;
  onPlaylist: (id: string) => void;
};

export function MobileCollectionPicker(props: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState<string[]>([]);
  const open = props.kind !== null;
  useEffect(() => {
    if (!open) return;
    setSearch('');
    setDraft(props.selectedGenres);
    const element = dialog.current;
    if (!element) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    element.showModal();
    const previousOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    return () => {
      element.close();
      document.documentElement.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [open, props.kind, props.selectedGenres]);

  if (!open || typeof document === 'undefined') return null;
  const MusicIcon = props.section === 'originals' ? AudioLines : Disc3;
  const title = props.kind === 'music' ? (props.section === 'originals' ? (props.ru ? 'Все треки' : 'All tracks') : (props.ru ? 'Все миксы' : 'All mixes')) : props.kind === 'sections' ? (props.ru ? 'Раздел' : 'Section') : props.kind === 'playlists' ? (props.ru ? 'Плейлист' : 'Playlist') : (props.ru ? 'Жанры' : 'Genres');
  return createPortal(
    <dialog ref={dialog} className="paper-mobile-picker" aria-labelledby={titleId}
      onCancel={props.onClose}
      onClick={event => { event.stopPropagation(); if (event.target === event.currentTarget) props.onClose(); }}
      onPointerDown={event => event.stopPropagation()}>
      <div className="paper-mobile-picker__body">
        <header><h2 id={titleId}>{title}</h2><button type="button" autoFocus aria-label={props.ru ? 'Закрыть выбор' : 'Close picker'} onClick={props.onClose}><X size={20} /></button></header>
        {props.kind === 'music' ? <>
          <input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder={props.ru ? 'Поиск по названию или артисту' : 'Search title or artist'} aria-label={props.ru ? 'Поиск музыки' : 'Search music'} />
          <div className="paper-mobile-picker__list">
            {props.music.filter(item => `${item.artist} ${item.title}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())).map(item => <button type="button" key={item.id} data-section={props.section} onClick={() => {props.onMusic(item.id);props.onClose();}}><span className="paper-mobile-picker__section"><MusicIcon size={18} aria-hidden="true" /><span className="paper-mobile-picker__music"><strong>{item.artist}</strong><span className="paper-mobile-picker__music-title"> : {item.title}</span></span></span></button>)}
            {!props.music.some(item => `${item.artist} ${item.title}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())) && <p>{props.ru ? 'Ничего не найдено' : 'No results'}</p>}
          </div>
        </> : props.kind === 'genres' ? <>
          <input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder={props.ru ? 'Найти жанр' : 'Find a genre'} aria-label={props.ru ? 'Поиск жанра' : 'Search genres'} />
          <p className="paper-mobile-picker__hint">{props.ru ? `Можно выбрать до ${props.maxGenres} жанров` : `Choose up to ${props.maxGenres} genres`}</p>
          <div className="paper-mobile-picker__list">
            <button type="button" data-section="collection" aria-pressed={!draft.length} onClick={() => setDraft([])}><span className="paper-mobile-picker__section"><Library size={18} aria-hidden="true" /><span>{props.ru ? 'Все жанры' : 'All genres'}</span></span>{!draft.length && <Check size={18} />}</button>
            {props.genres.filter(([style]) => style.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())).map(([style, count]) => {
              const selected = draft.includes(style);
              return <button type="button" key={style} data-section="collection" aria-pressed={selected} disabled={!selected && draft.length >= props.maxGenres} onClick={() => setDraft(current => selected ? current.filter(value => value !== style) : [...current, style])}><span className="paper-mobile-picker__section"><Library size={18} aria-hidden="true" /><span>{style} <small>{count}</small></span></span>{selected && <Check size={18} />}</button>;
            })}
            {search.trim() && !props.genres.some(([style]) => style.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())) && <p>{props.ru ? 'Ничего не найдено' : 'No genres found'}</p>}
          </div>
          <footer><button type="button" onClick={() => { props.onGenres(draft); props.onClose(); }}>{props.ru ? 'Применить' : 'Apply'}{draft.length ? ` (${draft.length})` : ''}</button></footer>
        </> : <>
          {props.kind === 'playlists' && <input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder={props.ru ? 'Найти плейлист' : 'Find a playlist'} aria-label={props.ru ? 'Поиск плейлиста' : 'Search playlists'} />}
          <div className="paper-mobile-picker__list">
          {props.kind === 'sections' ? props.sections.map(option => {
            const Icon = sectionIcons[option.key];
            return <button type="button" key={option.key} data-section={option.key} aria-pressed={props.section === option.key} onClick={() => { props.onSection(option.key); props.onClose(); }}><span className="paper-mobile-picker__section"><Icon size={18} aria-hidden="true" /><span>{option.label} <small>{option.count}</small></span></span>{props.section === option.key && <Check size={18} aria-hidden="true" />}</button>;
          }) : props.playlists.filter(playlist => playlist.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())).map(playlist => <button type="button" key={playlist.id} aria-pressed={props.selectedPlaylist === playlist.id} onClick={() => { props.onPlaylist(playlist.id); props.onClose(); }}><span className="paper-mobile-picker__section"><ListMusic size={18} aria-hidden="true" /><span>{playlist.name} <small>{playlist.count}</small></span></span>{props.selectedPlaylist === playlist.id && <Check size={18} />}</button>)}
          {props.kind === 'playlists' && !props.playlists.length && <p>{props.ru ? 'Плейлистов пока нет' : 'No playlists yet'}</p>}
          {props.kind === 'playlists' && props.playlists.length > 0 && !props.playlists.some(playlist => playlist.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())) && <p>{props.ru ? 'Ничего не найдено' : 'No results'}</p>}
          </div>
        </>}
      </div>
    </dialog>, document.body,
  );
}
