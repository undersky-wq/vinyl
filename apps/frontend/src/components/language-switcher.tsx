'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { SiteLang } from '../lib/language';

type LanguageSwitcherProps = {
  lang: SiteLang;
  single?: boolean;
};

export function LanguageSwitcher({ lang, single = false }: LanguageSwitcherProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [displayLang, setDisplayLang] = useState(lang);

  useEffect(() => setDisplayLang(lang), [lang]);

  function switchLanguage(nextLang: SiteLang) {
    if (nextLang === displayLang) {
      return;
    }

    setDisplayLang(nextLang);
    document.cookie = `site-lang=${nextLang}; path=/; max-age=31536000; SameSite=Lax`;
    document.documentElement.lang = nextLang;
    window.dispatchEvent(new CustomEvent('vinyl:language-change', { detail: nextLang }));
    startTransition(() => {
      router.refresh();
    });
  }

  if (single) {
    const nextLang: SiteLang = displayLang === 'ru' ? 'en' : 'ru';
    return (
      <button
        type="button"
        className="language-switch-button"
        onClick={() => switchLanguage(nextLang)}
        disabled={isPending}
        aria-label={nextLang === 'ru' ? 'Switch to Russian' : 'Switch to English'}
      >
        {displayLang === 'ru' ? 'RU' : 'ENG'}
      </button>
    );
  }

  return (
    <div className="language-toggle" aria-label="Language switcher">
      <button
        type="button"
        className={`language-chip${lang === 'ru' ? ' active' : ''}`}
        onClick={() => switchLanguage('ru')}
        disabled={isPending}
        aria-pressed={lang === 'ru'}
      >
        RU
      </button>
      <button
        type="button"
        className={`language-chip${lang === 'en' ? ' active' : ''}`}
        onClick={() => switchLanguage('en')}
        disabled={isPending}
        aria-pressed={lang === 'en'}
      >
        ENG
      </button>
    </div>
  );
}
