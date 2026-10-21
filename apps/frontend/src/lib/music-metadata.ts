import type { Metadata } from 'next';
import type { Release } from '../types';

export function musicMetadata(release: Release, path: string): Metadata {
  const site = (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://mityadima.ru').replace(/\/$/, '');
  const url = `${site}${path}`;
  const title = `${release.artist} - ${release.title}`;
  const description = [
    release.isOriginal ? 'Трек' : release.isMix ? 'Микс' : 'Виниловый релиз',
    release.year,
    ...(release.styles || []).slice(0, 3),
  ].filter(Boolean).join(' · ');
  const image = `${site}/releases/${encodeURIComponent(release.id)}/share-image`;
  return { title, description, metadataBase: new URL(site), alternates: { canonical: url },
    openGraph: { title, description, url, siteName: 'MityaDima', images: [{ url: image, alt: title }], type: release.isMix ? 'music.song' : 'music.album' },
    twitter: { card: 'summary_large_image', title, description, images: [image] },
  };
}
