'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { SiteLang } from '../lib/language';
import { useAuth } from '../providers/auth-provider';
import { ShelfThemeToggle } from './shelf-theme-toggle';
import { LanguageSwitcher } from './language-switcher';
import './archive-page-header.css';

export type ArchiveLayout = 'shelf' | 'stack' | 'grid' | 'tracks';

export function ArchivePageHeader({ lang, search, onSearchChange, onSearchSubmit, onHome, activeLayout, onLayoutChange, searchStatus }: {
  lang: SiteLang;
  search: string;
  onSearchChange: (search: string) => void;
  onSearchSubmit?: () => void;
  onHome: () => void;
  activeLayout: ArchiveLayout | null;
  onLayoutChange: (layout: ArchiveLayout) => void;
  searchStatus?: string;
}) {
  const { user } = useAuth();
  const [avatarFailed, setAvatarFailed] = useState(false);
  useEffect(() => setAvatarFailed(false), [user?.avatarStorageUrl]);
  const ru = lang === 'ru';
  return <div className="paper-identity paper-page-identity archive-page-header">
    <Link href="/profile" className="paper-avatar" aria-label={ru ? 'Настройки профиля' : 'Profile settings'}>
      {user?.avatarStorageUrl && !avatarFailed ? <img src={user.avatarStorageUrl} alt="" onError={() => setAvatarFailed(true)} /> : <span>{user?.displayName?.slice(0,1).toUpperCase() || '○'}</span>}
    </Link>
    <div className="paper-identity__content">
      <div className="paper-brand-row">
        <button type="button" className="paper-brand" onClick={onHome}>{ru ? 'Коллекция винила' : 'Vinyl collection'}</button>
        <ShelfThemeToggle compact iconOnly />
        <LanguageSwitcher lang={lang} single />
      </div>
      <div className="paper-search-row">
        <input className="paper-search" type="search" value={search} placeholder={ru ? 'Поиск' : 'Search'} aria-label={ru ? 'Поиск релизов и миксов' : 'Search releases and mixes'} onChange={event => onSearchChange(event.target.value)} onKeyDown={event => {if (event.key === 'Enter') onSearchSubmit?.();}} />
        {searchStatus && <span className="paper-search-status" role="status">{searchStatus}</span>}
        <nav className="paper-layout-controls" aria-label="Collection view">
          {(['shelf','stack','grid','tracks'] as const).map((layout,index) => <button key={layout} type="button" aria-pressed={activeLayout === layout} onClick={() => onLayoutChange(layout)}>{(ru ? ['Полка','Стопка','Сетка','Треки'] : ['Shelf','Stack','Grid','Tracks'])[index]}</button>)}
        </nav>
      </div>
    </div>
  </div>;
}
