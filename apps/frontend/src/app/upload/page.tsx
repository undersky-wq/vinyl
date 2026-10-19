import { cookies } from 'next/headers';
import Link from 'next/link';
import { ShelfThemeToggle } from '../../components/shelf-theme-toggle';
import { LanguageSwitcher } from '../../components/language-switcher';
import '../../components/record-archive.css';
import '../profile/profile.css';
import '../profile/profile-player.css';
import './upload.css';
import { UploadForm } from '../../components/upload-form';
import { getCurrentUser } from '../../lib/api';
import { normalizeSiteLang } from '../../lib/language';

export default async function UploadPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const initialOriginal = (await searchParams).type === 'original';
  const cookieStore = await cookies();
  const lang = normalizeSiteLang(cookieStore.get('site-lang')?.value);
  const cookieHeader = cookieStore
    .getAll()
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join('; ');
  const currentUser = await getCurrentUser(cookieHeader);
  const header = <header className="paper-profile-header">
    <div className="paper-profile-header__brand">
      <Link href="/">{lang === 'ru' ? 'Коллекция винила' : 'Vinyl collection'}</Link>
      <ShelfThemeToggle compact iconOnly />
      <LanguageSwitcher lang={lang} single />
    </div>
    <span>{initialOriginal ? 'Tracks' : (lang === 'ru' ? 'Коллекция' : 'Collection')} : {lang === 'ru' ? 'загрузка' : 'upload'}</span>
    <Link href={initialOriginal ? '/tracks' : '/'}>{lang === 'ru' ? 'Назад к музыке' : 'Back to music'}</Link>
  </header>;

  if (currentUser?.role !== 'ADMIN') {
    return (
      <main className="paper-profile-page paper-upload-page">
        {header}
        <section className="paper-upload-restricted">
          <p className="muted">{lang === 'ru' ? 'Доступ ограничен' : 'Restricted access'}</p>
          <h1>
            {lang === 'ru'
              ? 'Добавлять релизы и MP3 может только администратор.'
              : 'Only admin can add releases and MP3 files.'}
          </h1>
          <Link href="/profile?mode=login">{lang === 'ru' ? 'Войти в аккаунт' : 'Sign in'}</Link>
        </section>
      </main>
    );
  }

  return (
    <main className="paper-profile-page paper-upload-page">
      {header}
      <UploadForm lang={lang} initialOriginal={initialOriginal} />
    </main>
  );
}
