'use client';

import Link from 'next/link';
import { House, Library, ListMusic, Search } from 'lucide-react';
import { SiteLang } from '../lib/language';

export function MobileNav({ lang }: { lang: SiteLang }) {
  return (
    <nav className="mobile-nav" aria-label={lang === 'ru' ? 'Мобильная навигация' : 'Mobile navigation'}>
      <Link href="/" aria-label={lang === 'ru' ? 'Главная' : 'Home'}>
        <House size={23} />
      </Link>
      <Link href="/library" aria-label={lang === 'ru' ? 'Библиотека' : 'Library'}>
        <Library size={23} />
      </Link>
      <Link href="/playlists" aria-label={lang === 'ru' ? 'Плейлисты' : 'Playlists'}>
        <ListMusic size={23} />
      </Link>
      <Link href="/?focus=search" aria-label={lang === 'ru' ? 'Поиск' : 'Search'}>
        <Search size={23} />
      </Link>
    </nav>
  );
}
