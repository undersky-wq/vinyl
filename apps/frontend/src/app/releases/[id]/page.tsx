import { ReleaseDetail } from '../../../components/release-detail';
import { Topbar } from '../../../components/topbar';
import { getRelease } from '../../../lib/api';
import { cookies } from 'next/headers';
import { normalizeSiteLang } from '../../../lib/language';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function ReleasePage({ params }: { params: Promise<{ id: string }> }) {
  const cookieStore = await cookies();
  const lang = normalizeSiteLang(cookieStore.get('site-lang')?.value);
  const cookieHeader = cookieStore
    .getAll()
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join('; ');
  const { id } = await params;
  const release = await getRelease(id, cookieHeader);

  return (
    <main className="page-shell">
      <Topbar lang={lang} />
      <ReleaseDetail release={release} lang={lang} />
    </main>
  );
}
