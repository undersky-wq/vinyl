import './globals.css';
import '../components/shelf-theme.css';
import '../components/shelf-web.css';
import '../components/shelf-mobile-layout.css';
import '../components/shelf-typography.css';
import { cookies } from 'next/headers';
import { MobileNav } from '../components/mobile-nav';
import { CollectionTransitions } from '../components/collection-transitions';
import { PlayerChrome } from '../components/player-chrome';
import { TechnoDancer } from '../components/techno-dancer';
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
import { ArchiveHeaderShell } from '../components/archive-header-shell';
import { SiteTooltips } from '../components/site-tooltips';

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
    getRequestSiteSettings().catch(() => ({ siteDesign: 'shelf' as const, playbackRequiresRegistration: true })),
  ]);
  const favoriteTrackIds = currentUser ? await getFavorites(cookieHeader) : [];

  return (
    <html lang={lang} data-scroll-behavior="smooth" data-visual-variant="shelf" suppressHydrationWarning>
      <head>
        <link rel="stylesheet" href="/shelf.css" />
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var t=localStorage.getItem('mityadima-shelf-theme');document.documentElement.dataset.shelfTheme=t==='dark'?'dark':'light';document.documentElement.style.colorScheme=t==='dark'?'dark':'light'}catch(e){}})();` }} />
      </head>
      <body>
        <AdminEditModeSync />
        <SiteTooltips />
        <AuthProvider initialUser={currentUser} playbackRequiresRegistration={siteSettings.playbackRequiresRegistration ?? true} allowGuestMixPlayback={'allowGuestMixPlayback' in siteSettings && siteSettings.allowGuestMixPlayback === true}>
          <FavoritesProvider initialFavoriteTrackIds={favoriteTrackIds}>
            <PlaylistsProvider>
              <PlayerProvider>
                <DesignVariantProvider>
                  <ArchiveHeaderShell lang={lang}>{children}</ArchiveHeaderShell>
                  <CollectionTransitions lang={lang} />
                  <PlayerChrome lang={lang} />
                  <TechnoDancer />
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
