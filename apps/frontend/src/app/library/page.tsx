import { cookies } from 'next/headers';
import { Topbar } from '../../components/topbar';
import { TracklistBrowser } from '../../components/tracklist-browser';
import { getCurrentUser, getFavorites, getLibraryReleasesFeed, getPlaylistSummaries } from '../../lib/api';
import { normalizeSiteLang } from '../../lib/language';

const LIBRARY_PAGE_SIZE = 10;

export default async function LibraryPage() {
  const cookieStore = await cookies();
  const lang = normalizeSiteLang(cookieStore.get('site-lang')?.value);
  const cookieHeader = cookieStore
    .getAll()
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join('; ');
  const currentUser = await getCurrentUser(cookieHeader);
  const query = new URLSearchParams();
  query.set('limit', String(LIBRARY_PAGE_SIZE));
  query.set('offset', '0');

  const [playlists, libraryFeed, favorites] = await Promise.all([
    currentUser ? getPlaylistSummaries(cookieHeader) : Promise.resolve([]),
    getLibraryReleasesFeed(query, cookieHeader),
    currentUser ? getFavorites(cookieHeader) : Promise.resolve([]),
  ]);

  return (
    <main className="page-shell">
      <Topbar lang={lang} active="library" />
      <TracklistBrowser
        lang={lang}
        releases={libraryFeed.releases}
        playlists={playlists}
        initialFavoriteTrackIds={favorites}
        initialOptions={libraryFeed.options}
        initialHasMore={libraryFeed.hasMore}
        pageSize={LIBRARY_PAGE_SIZE}
      />
    </main>
  );
}
