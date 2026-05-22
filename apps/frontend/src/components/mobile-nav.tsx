'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AudioLines, Heart, House, Library, ListMusic } from 'lucide-react';
import { SiteLang } from '../lib/language';

export function MobileNav({ lang }: { lang: SiteLang }) {
  const pathname = usePathname();

  return (
    <nav className="mobile-nav" aria-label={lang === 'ru' ? 'Мобильная навигация' : 'Mobile navigation'}>
      <Link href="/" className={pathname === '/' ? 'active' : ''} aria-label={lang === 'ru' ? 'Главная' : 'Home'}>
        <House size={23} />
      </Link>
      <Link
        href="/library"
        className={pathname === '/library' ? 'active' : ''}
        aria-label={lang === 'ru' ? 'Библиотека' : 'Library'}
      >
        <Library size={23} />
      </Link>
      <Link
        href="/playlists"
        className={pathname === '/playlists' ? 'active' : ''}
        aria-label={lang === 'ru' ? 'Плейлисты' : 'Playlists'}
      >
        <ListMusic size={23} />
      </Link>
      <Link
        href="/mixes"
        className={pathname === '/mixes' ? 'active' : ''}
        aria-label={lang === 'ru' ? 'РњРёРєСЃС‹' : 'Mixes'}
      >
        <AudioLines size={23} />
      </Link>
      <Link
        href="/favorites"
        className={pathname === '/favorites' ? 'active' : ''}
        aria-label={lang === 'ru' ? 'Избранное' : 'Favorites'}
      >
        <Heart size={23} fill={pathname === '/favorites' ? 'currentColor' : 'none'} />
      </Link>
    </nav>
  );
}
