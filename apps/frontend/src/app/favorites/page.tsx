import { cookies } from 'next/headers';
import { getCurrentUser, getFavoriteTracks } from '../../lib/api';
import { normalizeSiteLang } from '../../lib/language';
import { FavoritesBrowser } from '../../components/favorites-browser';

export default async function FavoritesPage() {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();
  const lang = normalizeSiteLang(cookieStore.get('site_lang')?.value);
  const currentUser = await getCurrentUser(cookieHeader);
  const tracks = currentUser ? await getFavoriteTracks(cookieHeader) : [];

  return <FavoritesBrowser lang={lang} tracks={tracks} isLoggedIn={Boolean(currentUser)} />;
}
