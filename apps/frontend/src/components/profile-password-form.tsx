'use client';

import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import Link from 'next/link';
import { changeProfilePassword, type PasswordChangePolicy } from '../lib/api';
import type { SiteLang } from '../lib/language';

export function ProfilePasswordForm({ lang, policy }: { lang: SiteLang; policy: PasswordChangePolicy }) {
  const ru = lang === 'ru';
  const [currentPassword, setCurrent] = useState(''), [newPassword, setNext] = useState(''), [confirm, setConfirm] = useState('');
  const [code, setCode] = useState(''), [needsCode, setNeedsCode] = useState(policy.twoFactorRequired);
  const [inviteCode, setInviteCode] = useState(''), [needsInvite, setNeedsInvite] = useState(policy.inviteRequired);
  const [setupRequired, setSetupRequired] = useState(policy.admin && !policy.twoFactorEnabled);
  const [visible, setVisible] = useState(false), [busy, setBusy] = useState(false), [status, setStatus] = useState('');
  return <form className="profile-password-form" onSubmit={async event => {
    event.preventDefault(); if (busy || setupRequired || (policy.inviteRequired && !policy.inviteConfigured)) return;
    if (newPassword !== confirm) { setStatus(ru ? 'Новые пароли не совпадают.' : 'New passwords do not match.'); return; }
    setBusy(true); setStatus('');
    try {
      await changeProfilePassword({ currentPassword, newPassword, code: code || undefined, inviteCode: inviteCode || undefined });
      setCurrent(''); setNext(''); setConfirm(''); setCode(''); setInviteCode('');
      setStatus(ru ? 'Пароль изменён. На других устройствах потребуется войти заново.' : 'Password changed. Other devices must sign in again.');
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (message.includes('TWO_FACTOR_SETUP_REQUIRED')) { setSetupRequired(true); setStatus(ru ? 'Сначала включите двухфакторную защиту.' : 'Enable two-factor protection first.'); }
      else if (message.includes('TWO_FACTOR_LOCKED') || message.includes('Too many')) setStatus(ru ? 'Слишком много попыток. Повторите через 15 минут.' : 'Too many attempts. Try again in 15 minutes.');
      else if (message.includes('TWO_FACTOR')) { setNeedsCode(true); setStatus(ru ? 'Введите действующий код из аутентификатора или резервный код.' : 'Enter a valid authenticator or recovery code.'); }
      else if (message.includes('INVITE_CODE')) { setNeedsInvite(true); setStatus(message.includes('UNAVAILABLE') ? (ru ? 'Инвайт-код не настроен на сервере. Обратитесь к администратору.' : 'Invite code is not configured. Contact the administrator.') : (ru ? 'Проверьте инвайт-код.' : 'Check the invite code.')); }
      else setStatus(ru ? 'Не удалось изменить пароль. Проверьте текущий пароль и повторите попытку.' : 'Could not change password. Check your current password and try again.');
    } finally { setBusy(false); }
  }}>
    <h2>{ru ? 'Изменить пароль' : 'Change password'}</h2>
    {setupRequired && <p><Link href="/profile?section=security">{ru ? 'Сначала включите двухфакторную защиту в настройках безопасности.' : 'Enable two-factor protection in security settings first.'}</Link></p>}
    {policy.inviteRequired && !policy.inviteConfigured && <p role="alert">{ru ? 'Инвайт-код не настроен на сервере. Смена пароля пока недоступна.' : 'Invite code is not configured. Password changes are unavailable.'}</p>}
    {[
      [ru ? 'Текущий пароль' : 'Current password', currentPassword, setCurrent, 'current-password'],
      [ru ? 'Новый пароль' : 'New password', newPassword, setNext, 'new-password'],
      [ru ? 'Повторите новый пароль' : 'Confirm new password', confirm, setConfirm, 'new-password'],
    ].map(([label, value, set, autocomplete], index) => <label key={label as string}>{label as string}<input type={visible ? 'text' : 'password'} value={value as string} required minLength={index ? 8 : 1} maxLength={1024} autoComplete={autocomplete as string} disabled={busy} onChange={event => (set as (value: string) => void)(event.target.value)}/></label>)}
    <button type="button" className="profile-password-visibility" aria-pressed={visible} onClick={()=>setVisible(value=>!value)}>{visible ? <EyeOff size={16}/> : <Eye size={16}/>} {visible ? (ru?'Скрыть пароль':'Hide password') : (ru?'Показать пароль':'Show password')}</button>
    {needsCode && <label>{ru ? 'Код аутентификатора или резервный код' : 'Authenticator or recovery code'}<input value={code} autoComplete="one-time-code" maxLength={64} required disabled={busy} onChange={event=>setCode(event.target.value)}/></label>}
    {needsInvite && <label>{policy.admin ? (ru ? 'Административный инвайт-код' : 'Administrator invite code') : (ru ? 'Инвайт-код' : 'Invite code')}<input type={visible ? 'text' : 'password'} value={inviteCode} autoComplete="off" maxLength={1024} required disabled={busy} onChange={event=>setInviteCode(event.target.value)}/></label>}
    <button type="submit" disabled={busy || setupRequired || (policy.inviteRequired && !policy.inviteConfigured)}>{busy ? (ru?'Сохранение…':'Saving…') : (ru?'Изменить пароль':'Change password')}</button>
    {status && <p role="status">{status}</p>}
  </form>;
}
