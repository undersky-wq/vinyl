import { cookies } from 'next/headers';
import { Topbar } from '../../components/topbar';
import { PlaylistBrowser } from '../../components/playlist-browser';
import { getCurrentUser, getPlaylist, getPlaylistSummaries } from '../../lib/api';
import { normalizeSiteLang } from '../../lib/language';

export default async function PlaylistsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const cookieStore = await cookies();
  const lang = normalizeSiteLang(cookieStore.get('site-lang')?.value);
  const params = await searchParams;
  const activePlaylistId = typeof params.playlist === 'string' ? params.playlist : '';
  const cookieHeader = cookieStore
    .getAll()
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join('; ');
  const currentUser = await getCurrentUser(cookieHeader);
  const playlistSummaries = currentUser ? await getPlaylistSummaries(cookieHeader) : [];
  const resolvedActivePlaylistId = activePlaylistId || playlistSummaries[0]?.id || '';
  const activePlaylist = resolvedActivePlaylistId
    ? await getPlaylist(resolvedActivePlaylistId, cookieHeader)
    : null;

  return (
    <main className="page-shell">
      <Topbar lang={lang} active="playlists" hideSearch />
      <PlaylistBrowser
        lang={lang}
        playlistSummaries={playlistSummaries}
        initialPlaylist={activePlaylist}
        initialPlaylistId={resolvedActivePlaylistId}
      />
    </main>
  );
}
