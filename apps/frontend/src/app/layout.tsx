import './globals.css';
import '../components/shelf-theme.css';
import '../components/shelf-web.css';
import '../components/shelf-mobile-layout.css';
import { cookies } from 'next/headers';
import { MobileNav } from '../components/mobile-nav';
import { CollectionTransitions } from '../components/collection-transitions';
import { PlayerChrome } from '../components/player-chrome';
import { AdminEditModeSync } from '../components/admin-edit-mode-sync';
import { getCurrentUser, getFavorites } from '../lib/api';
import { getRequestSiteSettings } from '../lib/server-site-settings';
import { PlayerProvider } from '../providers/player-provider';
import { AuthProvider } from '../providers/auth-provider';
import { FavoritesProvider } from '../providers/favorites-provider';
import { PlaylistsProvider } from '../providers/playlists-provider';
import { normalizeSiteLang } from '../lib/language';
import { DesignVariantProvider } from '../components/design-variant-switcher';
import { CookieConsent } from '../components/cookie-consent';

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
  const hasSession = Boolean(cookieStore.get('vinyl_session')?.value);
  const [currentUser, siteSettings] = await Promise.all([
    hasSession ? getCurrentUser(cookieHeader) : Promise.resolve(null),
    getRequestSiteSettings().catch(() => ({ siteDesign: 'classic' as const })),
  ]);
  const favoriteTrackIds = currentUser ? await getFavorites(cookieHeader) : [];

  return (
    <html lang={lang} data-scroll-behavior="smooth" data-visual-variant={siteSettings.siteDesign} suppressHydrationWarning>
      <head>
        {siteSettings.siteDesign === 'shelf' ? <link rel="stylesheet" href="/shelf.css" /> : null}
        {siteSettings.siteDesign === 'shelf' ? <script dangerouslySetInnerHTML={{ __html: `(function(){try{var t=localStorage.getItem('mityadima-shelf-theme');document.documentElement.dataset.shelfTheme=t==='dark'?'dark':'light';document.documentElement.style.colorScheme=t==='dark'?'dark':'light'}catch(e){}})();` }} /> : null}
      </head>
      <body>
        <AdminEditModeSync />
        <AuthProvider initialUser={currentUser}>
          <FavoritesProvider initialFavoriteTrackIds={favoriteTrackIds}>
            <PlaylistsProvider>
              <PlayerProvider>
                <DesignVariantProvider initialVariant={siteSettings.siteDesign}>
                  {children}
                  {siteSettings.siteDesign === 'shelf' ? <CollectionTransitions lang={lang} /> : null}
                  <PlayerChrome lang={lang} />
                  <MobileNav lang={lang} />
                  <CookieConsent lang={lang} />
                </DesignVariantProvider>
              </PlayerProvider>
            </PlaylistsProvider>
          </FavoritesProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
