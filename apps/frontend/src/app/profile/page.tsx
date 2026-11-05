import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import '../../components/record-archive.css';
import './profile.css';
import './profile-player.css';
import { getAuthSettings, getCurrentUser, getProfileStats } from '../../lib/api';
import { normalizeSiteLang } from '../../lib/language';
import { getRequestSiteSettings } from '../../lib/server-site-settings';
import { AuthScreen } from '../../components/auth-screen';
import { ProfileScreen } from '../../components/profile-screen';
import { ShelfThemeToggle } from '../../components/shelf-theme-toggle';
import { LanguageSwitcher } from '../../components/language-switcher';

function ProfileHeader({ lang }: { lang: 'ru' | 'en' }) {
  return <header className="paper-profile-header">
    <div className="paper-profile-header__brand">
      <Link href="/">{lang === 'ru' ? 'Коллекция винила' : 'Vinyl collection'}</Link>
      <ShelfThemeToggle compact iconOnly />
      <LanguageSwitcher lang={lang} single />
    </div>
    <span>{lang === 'ru' ? 'Профиль : настройки' : 'Profile : settings'}</span>
    <Link href="/">{lang === 'ru' ? 'Вся коллекция' : 'All records'}</Link>
  </header>;
}

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const cookieStore = await cookies();
  const lang = normalizeSiteLang(cookieStore.get('site-lang')?.value);
  const cookieHeader = cookieStore
    .getAll()
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join('; ');
  const currentUser = await getCurrentUser(cookieHeader);
  const params = await searchParams;
  const mode = typeof params.mode === 'string' ? params.mode : '';

  if (!currentUser) {
    const siteSettings = await getRequestSiteSettings().catch(() => null);
    return (
      <main className="paper-profile-page">
        <ProfileHeader lang={lang} />
        <AuthScreen lang={lang} mode={mode === 'register' ? 'register' : 'login'}
          initialInviteRequired={typeof siteSettings?.registrationInviteRequired === 'boolean' ? siteSettings.registrationInviteRequired : null} />
      </main>
    );
  }

  if (mode === 'login' || mode === 'register') {
    redirect('/profile');
  }

  const [stats, authSettings] = await Promise.all([
    getProfileStats(cookieHeader),
    currentUser.role === 'ADMIN'
      ? getAuthSettings(cookieHeader).catch(() => ({ registrationInviteRequired: false, siteDesign: 'shelf' as const }))
      : Promise.resolve({ registrationInviteRequired: false, siteDesign: 'shelf' as const }),
  ]);

  return (
    <main className="paper-profile-page">
      <ProfileHeader lang={lang} />
      <ProfileScreen
        lang={lang}
        user={currentUser}
        releasesCount={stats.releasesCount}
        mixesCount={stats.mixesCount}
        tracksCount={stats.tracksCount}
        playlistsCount={stats.playlistsCount}
        authSettings={authSettings}
      />
    </main>
  );
}
