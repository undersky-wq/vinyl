'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { SiteLang } from '../lib/language';

type LanguageSwitcherProps = {
  lang: SiteLang;
};

export function LanguageSwitcher({ lang }: LanguageSwitcherProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function switchLanguage(nextLang: SiteLang) {
    if (nextLang === lang) {
      return;
    }

    document.cookie = `site-lang=${nextLang}; path=/; max-age=31536000; SameSite=Lax`;
    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <div className="language-toggle" aria-label="Language switcher">
      <button
        type="button"
        className={`language-chip${lang === 'ru' ? ' active' : ''}`}
        onClick={() => switchLanguage('ru')}
        disabled={isPending}
      >
        {lang === 'ru' ? 'РУ' : 'RU'}
      </button>
      <button
        type="button"
        className={`language-chip${lang === 'en' ? ' active' : ''}`}
        onClick={() => switchLanguage('en')}
        disabled={isPending}
      >
        {lang === 'ru' ? 'АНГ' : 'ENG'}
      </button>
    </div>
  );
}
