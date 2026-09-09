import '@fontsource-variable/archivo-narrow';
import '@fontsource-variable/unbounded';
import '@fontsource/michroma';
import '@fontsource-variable/ibm-plex-sans';
import '@fontsource-variable/cormorant';
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
import { SonicField } from '../components/sonic-field';
import { DesignVariantProvider, DesignVariantSwitcher } from '../components/design-variant-switcher';

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
    <html lang={lang} data-scroll-behavior="smooth" data-visual-variant="signal" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var ids=['signal','xerox','acid','chrome','grid','nocturne','shelf','jewel'];var p=new URLSearchParams(location.search).get('skin');var s=localStorage.getItem('mityadima-design-variant');var v=ids.indexOf(p)>-1?p:(ids.indexOf(s)>-1?s:'signal');document.documentElement.dataset.visualVariant=v==='jewel'?'shelf':v;document.documentElement.style.setProperty('--variant-index',String(ids.indexOf(v)));}catch(e){}})();`,
          }}
        />
      </head>
      <body>
        <AdminEditModeSync />
        <AuthProvider initialUser={currentUser}>
          <FavoritesProvider initialFavoriteTrackIds={favoriteTrackIds}>
            <PlaylistsProvider>
              <PlayerProvider>
                <DesignVariantProvider>
                  <SonicField />
                  <DesignVariantSwitcher />
                  {children}
                  <CollectionTransitions />
                  <PlayerChrome lang={lang} />
                  <MobileNav lang={lang} />
                </DesignVariantProvider>
              </PlayerProvider>
            </PlaylistsProvider>
          </FavoritesProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
