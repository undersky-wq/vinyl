import './globals.css';
import { cookies } from 'next/headers';
import { MobileNav } from '../components/mobile-nav';
import { CollectionTransitions } from '../components/collection-transitions';
import { PlayerChrome } from '../components/player-chrome';
import { AdminEditModeSync } from '../components/admin-edit-mode-sync';
import { getCurrentUser, getFavorites } from '../lib/api';
import { PlayerProvider } from '../providers/player-provider';
import { AuthProvider } from '../providers/auth-provider';
import { FavoritesProvider } from '../providers/favorites-provider';
import { PlaylistsProvider } from '../providers/playlists-provider';
import { normalizeSiteLang } from '../lib/language';

export const metadata = {
  title: 'MityaDima — Vinyl & Mixes',
  description: 'MityaDima vinyl collection, mixes and nocturnal frequencies.',
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const cookieStore = await cookies();
  const lang = normalizeSiteLang(cookieStore.get('site-lang')?.value);
  const cookieHeader = cookieStore
    .getAll()
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join('; ');
  const currentUser = await getCurrentUser(cookieHeader);
  const favoriteTrackIds = currentUser ? await getFavorites(cookieHeader) : [];

  return (
    <html lang={lang} data-scroll-behavior="smooth" data-visual-variant="shelf">
      <body>
        <AdminEditModeSync />
        <AuthProvider initialUser={currentUser}>
          <FavoritesProvider initialFavoriteTrackIds={favoriteTrackIds}>
            <PlaylistsProvider>
              <PlayerProvider>
                {children}
                <CollectionTransitions />
                <PlayerChrome lang={lang} />
                <MobileNav lang={lang} />
              </PlayerProvider>
            </PlaylistsProvider>
          </FavoritesProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
