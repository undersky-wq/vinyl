import { cookies } from 'next/headers';
import { MixesBrowser } from '../../components/mixes-browser';
import { PaperSectionShell } from '../../components/paper-section-shell';
import { getLibraryReleasesFeed } from '../../lib/api';
import { normalizeSiteLang } from '../../lib/language';

const MIXES_PAGE_SIZE = 80;

export default async function MixesPage() {
  const cookieStore = await cookies();
  const lang = normalizeSiteLang(cookieStore.get('site-lang')?.value);
  const cookieHeader = cookieStore.toString();
  const query = new URLSearchParams();
  query.set('limit', String(MIXES_PAGE_SIZE));
  query.set('offset', '0');
  query.set('isMix', 'true');

  const feed = await getLibraryReleasesFeed(query, cookieHeader);

  return (
    <PaperSectionShell section="mixes">
      <MixesBrowser lang={lang} releases={feed.releases} />
    </PaperSectionShell>
  );
}
