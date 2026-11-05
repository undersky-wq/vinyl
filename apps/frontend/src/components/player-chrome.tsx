'use client';

import { usePathname } from 'next/navigation';
import { SiteLang } from '../lib/language';
import { MiniPlayer } from './mini-player';
import './mini-player-layout-motion.css';

export function PlayerChrome({ lang }: { lang: SiteLang }) {
  const pathname = usePathname();

  if (pathname === '/player') {
    return null;
  }

  return <MiniPlayer lang={lang} />;
}
