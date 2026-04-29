import { cookies } from 'next/headers';
import { Topbar } from '../../components/topbar';
import { UploadForm } from '../../components/upload-form';
import { getCurrentUser } from '../../lib/api';
import { normalizeSiteLang } from '../../lib/language';

export default async function UploadPage() {
  const cookieStore = await cookies();
  const lang = normalizeSiteLang(cookieStore.get('site-lang')?.value);
  const cookieHeader = cookieStore
    .getAll()
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join('; ');
  const currentUser = await getCurrentUser(cookieHeader);

  if (currentUser?.role !== 'ADMIN') {
    return (
      <main className="page-shell">
        <Topbar lang={lang} active="upload" />
        <section className="hero">
          <p className="muted">{lang === 'ru' ? 'Доступ ограничен' : 'Restricted access'}</p>
          <h1>
            {lang === 'ru'
              ? 'Добавлять релизы и MP3 может только администратор.'
              : 'Only admin can add releases and MP3 files.'}
          </h1>
        </section>
      </main>
    );
  }

  return (
    <main className="page-shell">
      <Topbar lang={lang} active="upload" />
      <UploadForm lang={lang} />
    </main>
  );
}
