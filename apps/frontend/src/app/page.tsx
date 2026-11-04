import { cookies } from 'next/headers';
import { HomeStage } from '../components/home-stage';
import { getHomeReleases } from '../lib/api';
import { normalizeSiteLang } from '../lib/language';
import { getPublicHomeData } from '../lib/home-data-cache';

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const cookieStore = await cookies();
  const lang = normalizeSiteLang(cookieStore.get('site-lang')?.value);
  // Analytics and language cookies must not fragment the public cache.
  const session = cookieStore.get('vinyl_session')?.value;
  const cookieHeader = session ? `vinyl_session=${session}` : '';
  const params = await searchParams;
  const search = typeof params.search === 'string' ? params.search : '';

  const shelfQuery = new URLSearchParams();
  shelfQuery.set('summary', 'true');
  shelfQuery.set('catalog', 'true');
  if (search) shelfQuery.set('allTypes', 'true');

  const loadReleases = (params: URLSearchParams) => session
    ? getHomeReleases(params, cookieHeader)
    : getPublicHomeData(`releases:${params.toString()}`, () => getHomeReleases(params));
  const shelfReleases = await loadReleases(shelfQuery);

  return (
    <main className="page-shell page-shell--home">
      <HomeStage lang={lang} releases={shelfReleases} initialSearch={search} />
    </main>
  );
}
