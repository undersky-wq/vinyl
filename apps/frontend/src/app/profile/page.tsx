import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { Topbar } from '../../components/topbar';
import { getCurrentUser, getProfileStats } from '../../lib/api';
import { normalizeSiteLang } from '../../lib/language';
import { AuthScreen } from '../../components/auth-screen';
import { ProfileScreen } from '../../components/profile-screen';

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
    return (
      <main className="page-shell">
        <Topbar lang={lang} active="profile" />
        <AuthScreen lang={lang} mode={mode === 'register' ? 'register' : 'login'} />
      </main>
    );
  }

  if (mode === 'login' || mode === 'register') {
    redirect('/profile');
  }

  const stats = await getProfileStats(cookieHeader);

  return (
    <main className="page-shell">
      <Topbar lang={lang} active="profile" />
      <ProfileScreen
        lang={lang}
        user={currentUser}
        releasesCount={stats.releasesCount}
        tracksCount={stats.tracksCount}
        playlistsCount={stats.playlistsCount}
      />
    </main>
  );
}
