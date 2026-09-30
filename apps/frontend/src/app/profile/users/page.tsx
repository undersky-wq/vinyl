import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser, getSiteSettings, getUsers } from '../../../lib/api';
import { normalizeSiteLang } from '../../../lib/language';
import { Topbar } from '../../../components/topbar';
import '../profile.css';
import '../profile-player.css';

export default async function RegisteredUsersPage() {
  const cookieStore = await cookies();
  const lang = normalizeSiteLang(cookieStore.get('site-lang')?.value);
  const cookieHeader = cookieStore.getAll().map(cookie => `${cookie.name}=${cookie.value}`).join('; ');
  const user = await getCurrentUser(cookieHeader);
  if (!user) redirect('/profile?mode=login');
  if (user.role !== 'ADMIN') notFound();

  const [users, settings] = await Promise.all([
    getUsers(cookieHeader),
    getSiteSettings().catch(() => ({ siteDesign: 'classic' as const })),
  ]);
  const ru = lang === 'ru';
  const formatDate = (value: string) => new Intl.DateTimeFormat(ru ? 'ru-RU' : 'en-US', {
    day: '2-digit', month: 'short', year: 'numeric',
  }).format(new Date(value));

  return <main className={settings.siteDesign === 'shelf' ? 'paper-profile-page' : 'page-shell'}>
    {settings.siteDesign === 'shelf' ? <header className="paper-profile-header">
      <div className="paper-profile-header__brand"><Link href="/">{ru ? 'Коллекция винила' : 'Vinyl collection'}</Link></div>
      <span>{ru ? 'Зарегистрированные аккаунты' : 'Registered accounts'}</span>
      <Link href="/profile">{ru ? 'Назад в профиль' : 'Back to profile'}</Link>
    </header> : <><Topbar lang={lang} active="profile" /><Link href="/profile">{ru ? 'Назад в профиль' : 'Back to profile'}</Link></>}
    <article className="release-panel profile-panel profile-users-panel">
      <div className="profile-users-header"><h1>{ru ? 'Список зарегистрированных' : 'Registered users'}</h1><strong>{users.length}</strong></div>
      <div className="profile-users-list">
        {users.map(item => <div className="profile-user-row" key={item.id}>
          <div className="profile-user-avatar">{item.avatarStorageUrl ? <img src={item.avatarStorageUrl} alt={item.displayName} /> : <span>{(item.displayName || item.email || '?').slice(0, 1).toUpperCase()}</span>}</div>
          <div className="profile-user-main">
            <div className="profile-user-name"><strong>{item.displayName}</strong><span>{item.role}</span></div>
            <p className="muted">{item.email || (ru ? 'Без email' : 'No email')}</p>
            <p className="profile-user-date">{ru ? 'Регистрация' : 'Joined'} {formatDate(item.createdAt)}</p>
          </div>
          <div className="profile-user-stats">
            <span><b>{item._count.playlists}</b><em>{ru ? 'плейлисты' : 'playlists'}</em></span>
            <span><b>{item._count.favoriteTracks}</b><em>{ru ? 'избранное' : 'favourites'}</em></span>
            <span><b>{item._count.audioFiles}</b><em>MP3</em></span>
            <span><b>{item._count.collectionItems}</b><em>{ru ? 'коллекция' : 'collection'}</em></span>
          </div>
        </div>)}
        {!users.length && <p className="muted">{ru ? 'Зарегистрированных пользователей пока нет.' : 'No registered users yet.'}</p>}
      </div>
    </article>
  </main>;
}
