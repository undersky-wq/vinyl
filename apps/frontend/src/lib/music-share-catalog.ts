import 'server-only';
import { unstable_cache } from 'next/cache';
import { getLibraryReleasesFeed } from './api';
import { musicShareLinks } from './music-slug';

async function loadCatalog() {
  const sections = await Promise.all([false, true].map(async original => {
    const rows: { id: string; artist: string; title: string; isOriginal: boolean }[] = [];
    let offset = 0;
    for (;;) {
      const feed = await getLibraryReleasesFeed(new URLSearchParams({ isMix: 'true', isOriginal: String(original), limit: '200', offset: String(offset) }));
      rows.push(...feed.releases.map(release => ({ id: release.id, artist: release.artist, title: release.title, isOriginal: original })));
      if (!feed.hasMore || !feed.releases.length) break;
      offset += feed.releases.length;
    }
    return rows;
  }));
  return musicShareLinks(sections.flat());
}

export const getMusicShareCatalog = unstable_cache(loadCatalog, ['music-share-catalog-v1'], { revalidate: 30 });

export async function getMusicSharePath(id: string) {
  const links = await getMusicShareCatalog();
  return links.find(link => link.id === id)?.path
    || (await loadCatalog()).find(link => link.id === id)?.path
    || `/releases/${encodeURIComponent(id)}`;
}
