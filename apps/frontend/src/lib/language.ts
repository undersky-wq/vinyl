export type SiteLang = 'ru' | 'en';

export function normalizeSiteLang(value?: string | null): SiteLang {
  return value === 'en' ? 'en' : 'ru';
}
