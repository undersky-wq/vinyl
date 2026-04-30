import { cookies } from 'next/headers';
import { normalizeSiteLang } from '../../lib/language';
import { PlayerPageClient } from '../../components/player-page-client';

export default async function PlayerPage() {
  const cookieStore = await cookies();
  const lang = normalizeSiteLang(cookieStore.get('site_lang')?.value);

  return <PlayerPageClient lang={lang} />;
}
