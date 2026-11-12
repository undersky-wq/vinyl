'use client';

import { useEffect, useState, type ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { updateProfile } from '../lib/api';
import { useAuth } from '../providers/auth-provider';
import type { AuthUser } from '../types';
import type { SiteLang } from '../lib/language';

export function ProfileIdentityForm({ user, lang, onAvatar }: { user: AuthUser; lang: SiteLang; onAvatar: (event: ChangeEvent<HTMLInputElement>) => void }) {
  const ru = lang === 'ru', router = useRouter(), { setUser } = useAuth();
  const [name, setName] = useState(user.displayName);
  const [busy, setBusy] = useState(false), [status, setStatus] = useState('');
  useEffect(() => { setName(user.displayName); }, [user.id, user.displayName]);
  return <form className="profile-password-form profile-identity-form" onSubmit={async event => {
    event.preventDefault(); if (busy) return;
    setBusy(true); setStatus('');
    try {
      const updated = await updateProfile({ displayName: name.trim() });
      setUser(updated); router.refresh();
      setStatus(ru ? 'Профиль сохранён.' : 'Profile saved.');
    } catch {
      setStatus(ru ? 'Не удалось сохранить профиль. Проверьте имя и повторите попытку.' : 'Could not save profile. Check the name and try again.');
    } finally { setBusy(false); }
  }}>
    <label>{ru ? 'Имя' : 'Name'}<input value={name} required maxLength={80} autoComplete="nickname" disabled={busy} onChange={event=>setName(event.target.value)}/></label>
    <label>{ru ? 'Почта — логин (не изменяется)' : 'Email — login (cannot be changed)'}<input type="email" value={user.email || ''} autoComplete="email" readOnly/></label>
    <label className="profile-avatar-upload">{ru ? 'Изменить аватар' : 'Change avatar'}<input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={onAvatar}/></label>
    <button type="submit" disabled={busy}>{busy ? (ru ? 'Сохранение…' : 'Saving…') : (ru ? 'Сохранить профиль' : 'Save profile')}</button>
    {status && <p role="status">{status}</p>}
    <Link className="profile-password-link" href="/profile/password">{ru ? 'Изменить пароль' : 'Change password'} →</Link>
  </form>;
}
