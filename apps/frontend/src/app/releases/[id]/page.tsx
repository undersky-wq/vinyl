import { ReleaseDetail } from '../../../components/release-detail';
import { Topbar } from '../../../components/topbar';
import { getRelease, getSiteSettings } from '../../../lib/api';
import { SharedMusicEntry } from '../../../components/shared-music-entry';
import { cookies } from 'next/headers';
import { normalizeSiteLang } from '../../../lib/language';
import type { Metadata } from 'next';
import { getMusicSharePath } from '../../../lib/music-share-catalog';
import { musicMetadata } from '../../../lib/music-metadata';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;

  try {
    const release = await getRelease(id);
    return musicMetadata(release, release.isMix ? await getMusicSharePath(release.id) : `/releases/${release.id}`);
  } catch {
    return {
      title: 'MityaDima — Vinyl & Mixes',
      description: 'MityaDima Vinyl Collection',
    };
  }
}

export default async function ReleasePage({ params }: { params: Promise<{ id: string }> }) {
  const cookieStore = await cookies();
  const lang = normalizeSiteLang(cookieStore.get('site-lang')?.value);
  const cookieHeader = cookieStore
    .getAll()
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join('; ');
  const { id } = await params;
  const release = await getRelease(id, cookieHeader);
  const settings = await getSiteSettings().catch(() => ({siteDesign:'classic' as const}));
  if (release.isMix && (release.isOriginal || settings.siteDesign === 'shelf')) {
    return <SharedMusicEntry release={release} lang={lang}/>;
  }

  return (
    <main className="page-shell release-page-shell">
      <Topbar lang={lang} />
      <ReleaseDetail release={release} lang={lang} />
    </main>
  );
}
