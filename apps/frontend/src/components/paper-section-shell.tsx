'use client';
import Link from 'next/link';
import { Disc3, Heart, ListMusic } from 'lucide-react';
import { ReactNode, createContext, useContext, useDeferredValue, useEffect, useState } from 'react';
import { useAuth } from '../providers/auth-provider';
import { useCollectionCounts } from './use-collection-counts';
import './paper-sections.css';
import '../app/profile/profile-player.css';

const PaperSearchContext = createContext('');
export const usePaperSearch = () => useContext(PaperSearchContext);
export function matchesPaperSearch(text: string, query: string) {
  const haystack = text.toLocaleLowerCase();
  return query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean).every(word => haystack.includes(word));
}

export function PaperSectionShell({children, section}: {children: ReactNode; section:'favorites'|'mixes'}) {
  const {user} = useAuth();
  const counts = useCollectionCounts();
  const [avatarFailed,setAvatarFailed] = useState(false);
  const [search,setSearch] = useState('');
  const query = useDeferredValue(search);
  useEffect(() => setAvatarFailed(false),[user?.avatarStorageUrl]);
  return <PaperSearchContext.Provider value={query}><main className={`paper-section-page paper-section-page--${section}`}>
    <header className="paper-page-header">
      <div className="paper-page-identity">
        <Link href="/profile" className="paper-page-avatar" aria-label="Настройки профиля">
          {user?.avatarStorageUrl && !avatarFailed ? <img src={user.avatarStorageUrl} alt="" onError={()=>setAvatarFailed(true)}/> : <span>{user?.displayName?.slice(0,1).toUpperCase() || '○'}</span>}
        </Link>
        <div className="paper-page-identity-text"><Link href="/">Vinyl collection</Link>
          <input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder={section==='favorites'?'Поиск треков':'Поиск миксов'} aria-label={section==='favorites'?'Поиск в избранном':'Поиск миксов'}/>
        </div>
      </div>
      <span>{section==='favorites' ? 'Избранное' : 'Миксы'} : collection</span>
      <Link href="/">Вся коллекция</Link>
    </header>
    <nav className="paper-page-nav" aria-label="Разделы коллекции">
      <Link href="/?skin=shelf&view=playlists"><ListMusic size={16}/><span>Playlists <sup>{counts.playlists}</sup></span></Link>
      <Link href="/mixes" aria-current={section==='mixes'?'page':undefined}><Disc3 size={16}/><span>Mixes <sup>{counts.mixes}</sup></span></Link>
      <Link href="/favorites" aria-current={section==='favorites'?'page':undefined}><Heart size={16}/><span>Favorites <sup>{counts.favorites}</sup></span></Link>
    </nav>
    <div className="paper-page-content" aria-busy={query!==search}>{children}</div>
  </main></PaperSearchContext.Provider>;
}
