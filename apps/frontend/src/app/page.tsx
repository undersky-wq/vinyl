import { cookies } from 'next/headers';
import { HomeReleaseGrid } from '../components/home-release-grid';
import { HomeStyleFilters } from '../components/home-style-filters';
import { Topbar } from '../components/topbar';
import { HomeStage } from '../components/home-stage';
import { getHomeReleases, getReleaseStyles } from '../lib/api';
import { normalizeSiteLang } from '../lib/language';
import { getPublicHomeData } from '../lib/home-data-cache';
import { getRequestSiteSettings } from '../lib/server-site-settings';

function parseMultiValueParam(value: string | string[] | undefined) {
  if (!value) {
    return [];
  }

  const rawValues = Array.isArray(value) ? value : [value];
  return [...new Set(rawValues
    .flatMap((item) => item.split(','))
    .map((item) => item.trim())
    .filter(Boolean))].sort().slice(0, 5);
}

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
  const requestedStyles = parseMultiValueParam(params.style);
  const hasAudio = typeof params.hasAudio === 'string' ? params.hasAudio : '';
  const pageSize = 24;

  const shelfQuery = new URLSearchParams();
  shelfQuery.set('summary', 'true');
  shelfQuery.set('catalog', 'true');
  if (search) shelfQuery.set('allTypes', 'true');

  const loadReleases = (params: URLSearchParams) => session
    ? getHomeReleases(params, cookieHeader)
    : getPublicHomeData(`releases:${params.toString()}`, () => getHomeReleases(params));
  const shelfPromise = loadReleases(shelfQuery);
  const siteSettings = await getRequestSiteSettings().catch(() => ({ siteDesign: 'classic' as const }));

  // Shelf owns the whole page and must not hydrate the hidden classic grid.
  if (siteSettings.siteDesign === 'shelf') {
    const shelfReleases = await shelfPromise;
    return (
      <main className="page-shell page-shell--home">
        <HomeStage lang={lang} releases={shelfReleases} shelfReleases={shelfReleases} initialSearch={search} />
      </main>
    );
  }

  const releaseStylesPromise = session ? getReleaseStyles(cookieHeader)
    : getPublicHomeData('styles', () => getReleaseStyles());
  const releaseStyles = await releaseStylesPromise;
  const styles = releaseStyles.map((style) => style.name);
  const knownStyles = new Set(styles);
  const selectedStyles = requestedStyles.filter((style) => knownStyles.has(style));

  const query = new URLSearchParams();
  if (search) query.set('search', search);
  if (search) query.set('allTypes', 'true');
  if (hasAudio) query.set('hasAudio', hasAudio);
  if (selectedStyles.length) query.set('style', selectedStyles.join(','));
  query.set('summary', 'true');
  query.set('catalog', 'true');
  query.set('limit', String(pageSize));

  // Style combinations are the crawler's hot path. Filter the same ordered
  // collection rather than running another database query for every combination.
  const homePromise = search || hasAudio
    ? loadReleases(query)
    : shelfPromise.then((releases) => (
      selectedStyles.length
        ? releases.filter((release) => release.styles.some((style) => selectedStyles.includes(style)))
        : releases
    ).slice(0, pageSize));
  const homeReleases = await homePromise;

  return (
    <main className="page-shell page-shell--home">
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
