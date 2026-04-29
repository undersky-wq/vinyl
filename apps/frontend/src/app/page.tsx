import { cookies } from 'next/headers';
import { HomeReleaseGrid } from '../components/home-release-grid';
import { HomeStyleFilters } from '../components/home-style-filters';
import { Topbar } from '../components/topbar';
import { getHomeReleases, getReleaseStyles } from '../lib/api';
import { normalizeSiteLang } from '../lib/language';

function parseMultiValueParam(value: string | string[] | undefined) {
  if (!value) {
    return [];
  }

  const rawValues = Array.isArray(value) ? value : [value];
  return rawValues
    .flatMap((item) => item.split(','))
    .map((item) => item.trim())
    .filter(Boolean);
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const cookieStore = await cookies();
  const lang = normalizeSiteLang(cookieStore.get('site-lang')?.value);
  const cookieHeader = cookieStore
    .getAll()
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join('; ');
  const params = await searchParams;
  const query = new URLSearchParams();
  const search = typeof params.search === 'string' ? params.search : '';
  const selectedStyles = parseMultiValueParam(params.style);
  const hasAudio = typeof params.hasAudio === 'string' ? params.hasAudio : '';
  const pageSize = 24;

  if (search) query.set('search', search);
  if (hasAudio) query.set('hasAudio', hasAudio);
  if (selectedStyles.length) query.set('style', selectedStyles.join(','));
  query.set('summary', 'true');
  query.set('limit', String(pageSize));

  const [homeReleases, releaseStyles] = await Promise.all([
    getHomeReleases(query, cookieHeader),
    getReleaseStyles(cookieHeader),
  ]);
  const styles = releaseStyles.map((style) => style.name);

  return (
    <main className="page-shell">
      <Topbar lang={lang} search={search} active="home" />

      <HomeStyleFilters
        lang={lang}
        search={search}
        hasAudio={hasAudio}
        styles={styles}
        selectedStyles={selectedStyles}
      />

      <HomeReleaseGrid
        initialReleases={homeReleases}
        queryString={query.toString()}
        lang={lang}
        pageSize={pageSize}
      />
    </main>
  );
}
