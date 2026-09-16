'use client';
import Link from 'next/link';
import { Disc3, Heart, Library, ListMusic } from 'lucide-react';
import { ReactNode, createContext, useContext, useDeferredValue, useEffect, useState } from 'react';
import { useAuth } from '../providers/auth-provider';
import { useCollectionCounts } from './use-collection-counts';
import './paper-sections.css';
import '../app/profile/profile-player.css';
import { ShelfThemeToggle } from './shelf-theme-toggle';
import { LanguageSwitcher } from './language-switcher';
import { SiteLang } from '../lib/language';

const PaperSearchContext = createContext('');
export const usePaperSearch = () => useContext(PaperSearchContext);
export function matchesPaperSearch(text: string, query: string) {
  const haystack = text.toLocaleLowerCase();
  return query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean).every(word => haystack.includes(word));
}

export function PaperSectionShell({children, section, lang}: {children: ReactNode; section:'favorites'|'mixes'; lang: SiteLang}) {
  const [uiLang,setUiLang] = useState<SiteLang>(lang);
  useEffect(() => setUiLang(lang),[lang]);
  useEffect(() => {
    const update = (event: Event) => setUiLang((event as CustomEvent<SiteLang>).detail);
    window.addEventListener('vinyl:language-change',update);
    return () => window.removeEventListener('vinyl:language-change',update);
  },[]);
  const ru = uiLang === 'ru';
  const {user} = useAuth();
  const counts = useCollectionCounts();
  const [avatarFailed,setAvatarFailed] = useState(false);
  const [search,setSearch] = useState('');
  const [pendingSection,setPendingSection] = useState<'collection'|'playlists'|'mixes'|'favorites'|null>(null);
  const query = useDeferredValue(search);
  useEffect(() => setAvatarFailed(false),[user?.avatarStorageUrl]);
  return <PaperSearchContext.Provider value={query}><main className={`paper-section-page paper-section-page--${section}`}>
    <header className="paper-page-header">
      <div className="paper-page-identity">
        <Link href="/profile" className="paper-page-avatar" aria-label={ru ? 'Настройки профиля' : 'Profile settings'}>
          {user?.avatarStorageUrl && !avatarFailed ? <img src={user.avatarStorageUrl} alt="" onError={()=>setAvatarFailed(true)}/> : <span>{user?.displayName?.slice(0,1).toUpperCase() || '○'}</span>}
        </Link>
        <div className="paper-page-identity-text"><div className="paper-page-brand-row"><Link href="/">{ru ? 'Коллекция винила' : 'Vinyl collection'}</Link><ShelfThemeToggle compact iconOnly/><LanguageSwitcher lang={lang} single /></div>
          <input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder={section==='favorites' ? (ru ? 'Поиск треков' : 'Search tracks') : (ru ? 'Поиск миксов' : 'Search mixes')} aria-label={section==='favorites' ? (ru ? 'Поиск в избранном' : 'Search favorites') : (ru ? 'Поиск миксов' : 'Search mixes')}/>
        </div>
      </div>
      <span>{section==='favorites' ? (ru ? 'Избранное' : 'Favorites') : (ru ? 'Миксы' : 'Mixes')} : {ru ? 'коллекция' : 'collection'}</span>
      <div className="paper-page-header__actions"><Link href="/">{ru ? 'Вся коллекция' : 'All collection'}</Link></div>
    </header>
    <nav className="paper-page-nav" aria-label="Collection sections">
      <Link href="/" className="paper-section-collection" aria-current={pendingSection==='collection'?'page':undefined} onClick={()=>setPendingSection('collection')}><Library size={16}/><span>{ru ? 'Коллекция' : 'Collection'} <sup>{counts.releases}</sup></span></Link>
      <Link href="/?view=playlists" aria-current={pendingSection==='playlists'?'page':undefined} onClick={()=>setPendingSection('playlists')}><ListMusic size={16}/><span>{ru ? 'Плейлисты' : 'Playlists'} <sup>{counts.playlists}</sup></span></Link>
      <Link href="/mixes" aria-current={(pendingSection ? pendingSection==='mixes' : section==='mixes')?'page':undefined} onClick={()=>setPendingSection('mixes')}><Disc3 size={16}/><span>{ru ? 'Миксы' : 'Mixes'} <sup>{counts.mixes}</sup></span></Link>
      <Link href="/favorites" aria-current={(pendingSection ? pendingSection==='favorites' : section==='favorites')?'page':undefined} onClick={()=>setPendingSection('favorites')}><Heart size={16}/><span>{ru ? 'Избранное' : 'Favorites'} <sup>{counts.favorites}</sup></span></Link>
    </nav>
    <div className="paper-page-content" aria-busy={query!==search}>{children}</div>
  </main></PaperSearchContext.Provider>;
}
