import { ReleaseDetail } from '../../../components/release-detail';
import { Topbar } from '../../../components/topbar';
import { getRelease } from '../../../lib/api';
import { cookies } from 'next/headers';
import { normalizeSiteLang } from '../../../lib/language';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function getSiteUrl() {
  return (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://mityadima.ru').replace(/\/$/, '');
}

function getReleaseCoverUrl(release: Awaited<ReturnType<typeof getRelease>>) {
  return (
    release.coverMediumStorageUrl ||
    release.coverStorageUrl ||
    release.coverThumbStorageUrl ||
    release.coverImageUrl ||
    `${getSiteUrl()}/icon.png`
  );
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;

  try {
    const release = await getRelease(id);
    const siteUrl = getSiteUrl();
    const releaseUrl = `${siteUrl}/releases/${release.id}`;
    const title = `${release.artist} - ${release.title}${release.year ? ` • ${release.year}` : ''}`;
    const description = release.isMix ? 'MityaDima vinyl mix' : 'Vinyl Collection release';
    const imageUrl = getReleaseCoverUrl(release);

    return {
      title,
      description,
      metadataBase: new URL(siteUrl),
      alternates: {
        canonical: releaseUrl,
      },
      openGraph: {
        title,
        description,
        url: releaseUrl,
        siteName: 'Vinyl Collection',
        images: [
          {
            url: imageUrl,
            width: 1200,
            height: 1200,
            alt: title,
          },
        ],
        type: release.isMix ? 'music.song' : 'music.album',
      },
      twitter: {
        card: 'summary_large_image',
        title,
        description,
        images: [imageUrl],
      },
    };
  } catch {
    return {
      title: 'Vinyl Collection',
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

  return (
    <main className="page-shell release-page-shell">
      <Topbar lang={lang} />
      <ReleaseDetail release={release} lang={lang} />
    </main>
  );
}
