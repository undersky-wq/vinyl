'use client';

import { useDancerPreference } from '../lib/use-dancer-preference';
import { ProfileToggle } from './profile-toggle';

export function DancerSetting({ lang }: { lang: 'ru' | 'en' }) {
  const [enabled, setEnabled] = useDancerPreference();
  const label=lang === 'ru' ? 'Танцующий персонаж' : 'Dancing character';
  return <ProfileToggle checked={enabled} label={label} onChange={() => setEnabled(!enabled)} title={lang === 'ru' ? 'Появляется, когда играет Techno. Настройка сохраняется на этом устройстве.' : 'Appears while Techno is playing. Saved on this device.'}>{label}</ProfileToggle>;
}
