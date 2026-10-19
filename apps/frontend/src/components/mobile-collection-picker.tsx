'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, X } from 'lucide-react';
import './mobile-collection-picker.css';

export type MobileCollectionSection = 'collection' | 'playlists' | 'mixes' | 'originals' | 'favorites';
type Props = {
  kind: 'sections' | 'genres' | 'playlists' | null;
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
  const title = props.kind === 'sections' ? (props.ru ? 'Раздел' : 'Section') : props.kind === 'playlists' ? (props.ru ? 'Плейлист' : 'Playlist') : (props.ru ? 'Жанры' : 'Genres');
  return createPortal(
    <dialog ref={dialog} className="paper-mobile-picker" aria-labelledby={titleId}
      onCancel={props.onClose}
      onClick={event => { event.stopPropagation(); if (event.target === event.currentTarget) props.onClose(); }}
      onPointerDown={event => event.stopPropagation()}>
      <div className="paper-mobile-picker__body">
        <header><h2 id={titleId}>{title}</h2><button type="button" autoFocus aria-label={props.ru ? 'Закрыть выбор' : 'Close picker'} onClick={props.onClose}><X size={20} /></button></header>
        {props.kind === 'genres' ? <>
          <input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder={props.ru ? 'Найти жанр' : 'Find a genre'} aria-label={props.ru ? 'Поиск жанра' : 'Search genres'} />
          <p className="paper-mobile-picker__hint">{props.ru ? `Можно выбрать до ${props.maxGenres} жанров` : `Choose up to ${props.maxGenres} genres`}</p>
          <div className="paper-mobile-picker__list">
            <button type="button" aria-pressed={!draft.length} onClick={() => setDraft([])}><span>{props.ru ? 'Все жанры' : 'All genres'}</span>{!draft.length && <Check size={18} />}</button>
            {props.genres.filter(([style]) => style.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())).map(([style, count]) => {
              const selected = draft.includes(style);
              return <button type="button" key={style} aria-pressed={selected} disabled={!selected && draft.length >= props.maxGenres} onClick={() => setDraft(current => selected ? current.filter(value => value !== style) : [...current, style])}><span>{style} <small>{count}</small></span>{selected && <Check size={18} />}</button>;
            })}
            {search.trim() && !props.genres.some(([style]) => style.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())) && <p>{props.ru ? 'Ничего не найдено' : 'No genres found'}</p>}
          </div>
          <footer><button type="button" onClick={() => { props.onGenres(draft); props.onClose(); }}>{props.ru ? 'Применить' : 'Apply'}{draft.length ? ` (${draft.length})` : ''}</button></footer>
        </> : <div className="paper-mobile-picker__list">
          {props.kind === 'sections' ? props.sections.map(option => <button type="button" key={option.key} aria-pressed={props.section === option.key} onClick={() => { props.onSection(option.key); props.onClose(); }}><span>{option.label} <small>{option.count}</small></span>{props.section === option.key && <Check size={18} />}</button>) : props.playlists.map(playlist => <button type="button" key={playlist.id} aria-pressed={props.selectedPlaylist === playlist.id} onClick={() => { props.onPlaylist(playlist.id); props.onClose(); }}><span>{playlist.name} <small>{playlist.count}</small></span>{props.selectedPlaylist === playlist.id && <Check size={18} />}</button>)}
          {props.kind === 'playlists' && !props.playlists.length && <p>{props.ru ? 'Плейлистов пока нет' : 'No playlists yet'}</p>}
        </div>}
      </div>
    </dialog>, document.body,
  );
}
