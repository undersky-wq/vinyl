'use client';

import { SiteLang } from '../lib/language';
import { HomeRelease } from '../types';
import { RecordShelfStage } from './paper-archive';

type HomeStageProps = {
  lang: SiteLang;
  releases: HomeRelease[];
  shelfReleases?: HomeRelease[];
};

export function HomeStage({ lang, releases, shelfReleases }: HomeStageProps) {
  return <RecordShelfStage lang={lang} releases={shelfReleases || releases} />;
}
