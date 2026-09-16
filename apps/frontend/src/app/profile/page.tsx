import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Topbar } from '../../components/topbar';
import './profile.css';
import './profile-player.css';
import { getAuthSettings, getCurrentUser, getProfileStats, getSiteSettings, getUsers } from '../../lib/api';
import { normalizeSiteLang } from '../../lib/language';
import { AuthScreen } from '../../components/auth-screen';
import { ProfileScreen } from '../../components/profile-screen';

function ProfileHeader({ lang }: { lang: 'ru' | 'en' }) {
  return <header className="paper-profile-header">
    <Link href="/">Vinyl collection</Link>
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
  const siteSettings = await getSiteSettings().catch(() => ({ siteDesign: 'classic' as const }));
  const params = await searchParams;
  const mode = typeof params.mode === 'string' ? params.mode : '';

  if (!currentUser) {
    return (
      <main className={siteSettings.siteDesign === 'shelf' ? 'paper-profile-page' : 'page-shell'}>
        {siteSettings.siteDesign === 'shelf' ? <ProfileHeader lang={lang} /> : <Topbar lang={lang} active="profile" />}
        <AuthScreen lang={lang} mode={mode === 'register' ? 'register' : 'login'} />
      </main>
    );
  }

  if (mode === 'login' || mode === 'register') {
    redirect('/profile');
  }

  const [stats, users, authSettings] = await Promise.all([
    getProfileStats(cookieHeader),
    currentUser.role === 'ADMIN' ? getUsers(cookieHeader) : Promise.resolve([]),
    currentUser.role === 'ADMIN'
      ? getAuthSettings(cookieHeader).catch(() => ({ registrationInviteRequired: false, siteDesign: 'classic' as const }))
      : Promise.resolve({ registrationInviteRequired: false, siteDesign: 'classic' as const }),
  ]);

  return (
    <main className={siteSettings.siteDesign === 'shelf' ? 'paper-profile-page' : 'page-shell'}>
      {siteSettings.siteDesign === 'shelf' ? <ProfileHeader lang={lang} /> : <Topbar lang={lang} active="profile" />}
      <ProfileScreen
        lang={lang}
        user={currentUser}
        releasesCount={stats.releasesCount}
        tracksCount={stats.tracksCount}
        playlistsCount={stats.playlistsCount}
        users={users}
        authSettings={authSettings}
      />
    </main>
  );
}
