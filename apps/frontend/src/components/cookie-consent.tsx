'use client';

import Link from 'next/link';
import Script from 'next/script';
import { useEffect, useState } from 'react';
import { SiteLang } from '../lib/language';

const COOKIE_CHOICE_KEY = 'mityadima-cookie-choice-v1';

type CookieChoice = 'all' | 'necessary';

export function CookieConsent({ lang }: { lang: SiteLang }) {
  const [choice, setChoice] = useState<CookieChoice | null | undefined>(undefined);
  const ru = lang === 'ru';

  useEffect(() => {
    const saved = window.localStorage.getItem(COOKIE_CHOICE_KEY);
    setChoice(saved === 'all' || saved === 'necessary' ? saved : null);
  }, []);

  function saveChoice(nextChoice: CookieChoice) {
    window.localStorage.setItem(COOKIE_CHOICE_KEY, nextChoice);
    setChoice(nextChoice);
  }

  return (
    <>
      {choice === 'all' ? (
        <Script
          src="https://stats.mityadima.ru/script.js"
          data-website-id="c806c076-3efa-47ff-8d15-f5d913be11be"
          strategy="afterInteractive"
        />
      ) : null}

      {choice === null ? (
        <aside className="cookie-consent" role="dialog" aria-live="polite" aria-label={ru ? 'Настройки cookies' : 'Cookie settings'}>
          <p>
            {ru
              ? 'Мы используем необходимые cookies для входа, языка и настроек сайта. С вашего согласия также включается статистика посещений.'
              : 'We use necessary cookies for sign-in, language and site settings. With your consent, visit statistics are also enabled.'}{' '}
            <Link href="/privacy">{ru ? 'Политика обработки данных' : 'Privacy policy'}</Link>
          </p>
          <div className="cookie-consent__actions">
            <button type="button" onClick={() => saveChoice('necessary')}>
              {ru ? 'Только необходимые' : 'Necessary only'}
            </button>
            <button type="button" className="cookie-consent__accept" onClick={() => saveChoice('all')}>
              {ru ? 'Принять' : 'Accept'}
            </button>
          </div>
        </aside>
      ) : null}
    </>
  );
}
