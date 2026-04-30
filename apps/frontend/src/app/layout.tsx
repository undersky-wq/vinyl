import './globals.css';
import { cookies } from 'next/headers';
import { MobileNav } from '../components/mobile-nav';
import { PlayerChrome } from '../components/player-chrome';
import { getCurrentUser, getFavorites } from '../lib/api';
import { PlayerProvider } from '../providers/player-provider';
import { AuthProvider } from '../providers/auth-provider';
import { FavoritesProvider } from '../providers/favorites-provider';
import { normalizeSiteLang } from '../lib/language';

export const metadata = {
  title: 'Vinyl Collection',
  description: 'Personal vinyl collection',
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
    <html lang={lang}>
      <body>
        <AuthProvider initialUser={currentUser}>
          <FavoritesProvider initialFavoriteTrackIds={favoriteTrackIds}>
            <PlayerProvider>
              {children}
              <PlayerChrome lang={lang} />
              <MobileNav lang={lang} />
            </PlayerProvider>
          </FavoritesProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
