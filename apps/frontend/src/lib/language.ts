export type SiteLang = 'ru' | 'en';

export function normalizeSiteLang(value?: string | null): SiteLang {
  return value === 'en' ? 'en' : 'ru';
}

export function getBrowserSiteLang(): SiteLang {
  if (typeof document === 'undefined') {
    return 'ru';
  }

  const value = document.cookie
    .split('; ')
    .find((item) => item.startsWith('site-lang='))
    ?.split('=')[1];

  return normalizeSiteLang(value);
}
