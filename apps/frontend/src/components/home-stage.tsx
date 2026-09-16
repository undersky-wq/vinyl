'use client';

import { HomeRelease } from '../types';
import { SiteLang } from '../lib/language';
import { useDesignVariant } from './design-variant-switcher';
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
  const { variant } = useDesignVariant();
  if (variant !== 'shelf') return null;
  return <RecordShelfStage lang={lang} releases={shelfReleases || releases} initialSearch={initialSearch} />;
}
