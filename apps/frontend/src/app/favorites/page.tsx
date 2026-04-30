import { cookies } from 'next/headers';
import { getCurrentUser, getFavoriteTracks } from '../../lib/api';
import { normalizeSiteLang } from '../../lib/language';
import { FavoritesBrowser } from '../../components/favorites-browser';
import { Topbar } from '../../components/topbar';

export default async function FavoritesPage() {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();
  const lang = normalizeSiteLang(cookieStore.get('site-lang')?.value);
  const currentUser = await getCurrentUser(cookieHeader);
  const tracks = currentUser ? await getFavoriteTracks(cookieHeader) : [];

  return (
    <main className="page-shell">
      <Topbar lang={lang} hideSearch />
      <FavoritesBrowser lang={lang} tracks={tracks} isLoggedIn={Boolean(currentUser)} />
    </main>
  );
}
