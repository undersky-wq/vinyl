import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import '../../../components/record-archive.css';
import '../profile.css';
import '../profile-player.css';
import '../../../components/profile-admin-sections.css';
import { getCurrentUser, getPasswordChangePolicy } from '../../../lib/api';
import { normalizeSiteLang } from '../../../lib/language';
import { ProfilePasswordForm } from '../../../components/profile-password-form';
import { ShelfThemeToggle } from '../../../components/shelf-theme-toggle';
import { LanguageSwitcher } from '../../../components/language-switcher';

export default async function PasswordPage() {
  const store = await cookies(), lang = normalizeSiteLang(store.get('site-lang')?.value);
  const cookieHeader = store.getAll().map(cookie => `${cookie.name}=${cookie.value}`).join('; ');
  if (!await getCurrentUser(cookieHeader)) redirect('/profile?mode=login');
  const policy = await getPasswordChangePolicy(cookieHeader);
  return <main className="paper-profile-page">
    <header className="paper-profile-header"><div className="paper-profile-header__brand"><Link href="/">{lang==='ru' ? 'Коллекция винила' : 'Vinyl collection'}</Link><ShelfThemeToggle compact iconOnly/><LanguageSwitcher lang={lang} single/></div><span>{lang==='ru' ? 'Профиль : пароль' : 'Profile : password'}</span><Link href="/profile">{lang==='ru' ? 'Назад в профиль' : 'Back to profile'}</Link></header>
    <article className="release-panel profile-panel profile-password-page"><ProfilePasswordForm lang={lang} policy={policy}/></article>
  </main>;
}
