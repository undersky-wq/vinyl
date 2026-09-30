'use client';

import { useDancerPreference } from '../lib/use-dancer-preference';

export function DancerSetting({ lang }: { lang: 'ru' | 'en' }) {
  const [enabled, setEnabled] = useDancerPreference();
  return <button type="button" className={`profile-action-button profile-action-button--switch${enabled ? ' active' : ''}`} aria-pressed={enabled} onClick={() => setEnabled(!enabled)} title={lang === 'ru' ? 'Появляется, когда играет Techno. Настройка сохраняется на этом устройстве.' : 'Appears while Techno is playing. Saved on this device.'}>
    <span className="profile-action-button__label">{lang === 'ru' ? 'Танцующий персонаж' : 'Dancing character'}</span>
    <strong>{enabled ? 'ON' : 'OFF'}</strong>
  </button>;
}
