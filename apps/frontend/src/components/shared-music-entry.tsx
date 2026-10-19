'use client';

import { SiteLang } from '../lib/language';
import { Release } from '../types';
import { ShelfMixDetail } from './shelf-mix-detail';

export function SharedMusicEntry({ release, lang }: { release: Release; lang: SiteLang }) {
  return <div className="shared-music-entry" data-ready="true"><ShelfMixDetail release={release} lang={lang} /></div>;
}
