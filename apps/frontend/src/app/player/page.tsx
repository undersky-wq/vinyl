import { cookies } from 'next/headers';
import { normalizeSiteLang } from '../../lib/language';
import { PlayerPageClient } from '../../components/player-page-client';

type PlayerPageProps = {
  searchParams: Promise<{
    from?: string | string[];
  }>;
};

export default async function PlayerPage({ searchParams }: PlayerPageProps) {
  const cookieStore = await cookies();
  const params = await searchParams;
  const lang = normalizeSiteLang(cookieStore.get('site-lang')?.value);
  const returnTo = typeof params.from === 'string' ? params.from : '';

  return <PlayerPageClient lang={lang} returnTo={returnTo} />;
}
