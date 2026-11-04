'use client';

import { HomeRelease } from '../types';
import { SiteLang } from '../lib/language';
import { RecordShelfStage } from './paper-archive';

export function HomeStage({
  lang,
  releases,
  shelfReleases,
  initialSearch,
}: {
  lang: SiteLang;
  releases: HomeRelease[];
  shelfReleases?: HomeRelease[];
  initialSearch?: string;
}) {
  return <RecordShelfStage lang={lang} releases={shelfReleases || releases} initialSearch={initialSearch} />;
}
