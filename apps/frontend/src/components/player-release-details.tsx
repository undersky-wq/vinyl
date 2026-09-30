'use client';

import { Rotate3D } from 'lucide-react';
import { useEffect, useState } from 'react';
import { getRelease } from '../lib/api';
import type { SiteLang } from '../lib/language';

export function PlayerReleaseDetails({ releaseId, backArtwork, flipped, onFlip, lang }: {
  releaseId?: string;
  backArtwork?: string;
  flipped: boolean;
  onFlip: () => void;
  lang: SiteLang;
}) {
  const [metadata, setMetadata] = useState<{ id: string; year: number | null } | null>(null);
  useEffect(() => {
    if (!releaseId) return;
    let cancelled = false;
    void getRelease(releaseId).then(release => {
      if (!cancelled) setMetadata({ id: releaseId, year: release.year });
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [releaseId]);
  const year = metadata?.id === releaseId ? metadata?.year : null;
  const label = flipped
    ? (lang === 'ru' ? 'Показать лицевую сторону' : 'Show front cover')
    : (lang === 'ru' ? 'Показать обратную сторону' : 'Show back cover');
  return <div className="player-page__release-details">
    {year ? <time dateTime={String(year)} aria-label={lang === 'ru' ? `Год релиза: ${year}` : `Release year: ${year}`}>{year}</time> : null}
    {backArtwork ? <button type="button" className="player-page__cover-flip player-page__cover-flip--metadata" aria-pressed={flipped} aria-label={label} title={label} onClick={onFlip}><Rotate3D size={19}/></button> : null}
  </div>;
}
