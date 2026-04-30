'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { House, Library, ListMusic, Search } from 'lucide-react';
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
      <Link href="/?focus=search" aria-label={lang === 'ru' ? 'Поиск' : 'Search'}>
        <Search size={23} />
      </Link>
    </nav>
  );
}
