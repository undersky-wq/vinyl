import { cookies } from 'next/headers';
import { getCurrentUser, getFavoriteTracks, getSiteSettings } from '../../lib/api';
import { normalizeSiteLang } from '../../lib/language';
import { FavoritesBrowser } from '../../components/favorites-browser';
import { PaperSectionShell } from '../../components/paper-section-shell';
import { RecordShelfStage } from '../../components/paper-archive';
import { Topbar } from '../../components/topbar';

export default async function FavoritesPage() {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();
  const lang = normalizeSiteLang(cookieStore.get('site-lang')?.value);
  const currentUser = await getCurrentUser(cookieHeader);
  const tracks = currentUser ? await getFavoriteTracks(cookieHeader) : [];
  const siteSettings = await getSiteSettings().catch(() => ({ siteDesign: 'classic' as const }));

  if (siteSettings.siteDesign === 'shelf' && currentUser) return <main className="page-shell page-shell--home paper-favorites-page">
    <RecordShelfStage lang={lang} favoritesMode releases={tracks.map(track => ({
      ...track.release,
      tracks: [{ ...track, audioUrl: track.audioFiles?.find(file => file.storageUrl)?.storageUrl || '' }],
    }))} />
  </main>;

  if (siteSettings.siteDesign === 'shelf') return (
    <PaperSectionShell section="favorites" lang={lang}>
      <FavoritesBrowser lang={lang} tracks={tracks} isLoggedIn={Boolean(currentUser)} />
    </PaperSectionShell>
  );

  return <main className="page-shell"><Topbar lang={lang} active="favorites" /><FavoritesBrowser lang={lang} tracks={tracks} isLoggedIn={Boolean(currentUser)} /></main>;
}
