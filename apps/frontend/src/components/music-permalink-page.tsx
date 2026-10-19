import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getMusicShareCatalog } from '../lib/music-share-catalog';
import { getRelease } from '../lib/api';
import { normalizeSiteLang } from '../lib/language';
import { SharedMusicEntry } from './shared-music-entry';
import { musicMetadata } from '../lib/music-metadata';

async function findLink(slug: string, original: boolean) {
  return (await getMusicShareCatalog()).find(link => link.slug === slug && link.original === original);
}

export async function permalinkMetadata(slug: string, original: boolean): Promise<Metadata> {
  const link = await findLink(slug, original);
  if (!link) return {};
  return musicMetadata(await getRelease(link.id), link.path);
}

export async function MusicPermalinkPage({ slug, original }: { slug: string; original: boolean }) {
  const link = await findLink(slug, original);
  if (!link) notFound();
  const store = await cookies();
  const release = await getRelease(link.id, store.toString());
  return <SharedMusicEntry release={release} lang={normalizeSiteLang(store.get('site-lang')?.value)} />;
}
