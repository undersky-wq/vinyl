import { cookies } from 'next/headers';
import { AboutPage } from '../../components/about-page';
import { normalizeSiteLang } from '../../lib/language';

export const metadata = {
  title: 'Обо мне / About me — MityaDima',
  description: 'Дмитрий, Митя, Дима. Электронная музыка и коллекция винила с 2009 года.',
};

export default async function About() {
  const cookieStore = await cookies();
  return <AboutPage lang={normalizeSiteLang(cookieStore.get('site-lang')?.value)} />;
}
