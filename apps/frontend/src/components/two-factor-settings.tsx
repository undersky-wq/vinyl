'use client';

import { FormEvent, useEffect, useState } from 'react';
import { twoFactorRequest } from '../lib/api';
import { SiteLang } from '../lib/language';
import './two-factor-settings.css';

type Status = { enabled: boolean; recoveryCodesRemaining: number };
type Setup = { secret: string; qrDataUrl: string; expiresAt: string };

export function TwoFactorSettings({ lang }: { lang: SiteLang }) {
  const ru = lang === 'ru';
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [setup, setSetup] = useState<Setup | null>(null);
  const [recovery, setRecovery] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const refresh = () => twoFactorRequest<Status>('status').then(setStatus);
  useEffect(() => { refresh().catch(() => setMessage(ru ? 'Не удалось загрузить настройки защиты.' : 'Could not load security settings.')); }, [ru]);

  async function run(action: 'setup' | 'confirm' | 'disable' | 'recovery') {
    if (busy) return;
    setBusy(true); setMessage('');
    try {
      const result = await twoFactorRequest<Setup & { recoveryCodes?: string[] }>(action, { password, code: code.trim() || undefined });
      setCode('');
      if (action === 'setup') {
        setSetup(result);
        setMessage(ru ? 'Отсканируй QR-код. Затем введи код из нового аутентификатора. Настройка действует 10 минут.' : 'Scan the QR code, then enter a code from the new authenticator. Setup expires in 10 minutes.');
      } else {
        setSetup(null); setPassword('');
        setRecovery(result.recoveryCodes || []);
        await refresh();
        setMessage(action === 'disable'
          ? ru ? 'Защита отключена. Другие сессии завершены.' : 'Protection disabled. Other sessions signed out.'
          : ru ? 'Сохрани резервные коды отдельно от телефона. Они показываются только сейчас. Другие сессии завершены.' : 'Save these recovery codes separately from your phone. They are shown only now. Other sessions signed out.');
      }
    } catch (error) {
      const value = error instanceof Error ? error.message : '';
      setMessage(value === 'TWO_FACTOR_LOCKED'
        ? ru ? 'Слишком много попыток. Попробуй через 15 минут.' : 'Too many attempts. Try again in 15 minutes.'
        : value === 'TWO_FACTOR_SETUP_EXPIRED'
          ? ru ? 'Настройка истекла. Нажми «Начать заново».' : 'Setup expired. Choose “Start again”.'
          : ru ? 'Проверь пароль и код. Уже использованный код не подходит — дождись следующего.' : 'Check your password and code. An already used code cannot be reused; wait for the next one.');
    } finally { setBusy(false); }
  }

  function submit(event: FormEvent) { event.preventDefault(); void run(setup ? 'confirm' : 'setup'); }
  function download() {
    const blob = new Blob([`mityadima.ru — ${ru ? 'одноразовые резервные коды' : 'one-time recovery codes'}\n\n${recovery.join('\n')}\n`], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'mityadima-recovery-codes.txt'; anchor.click(); URL.revokeObjectURL(url);
  }

  return <div className="two-factor-settings">
    <button type="button" className="profile-action-button profile-action-button--switch" aria-expanded={open} onClick={() => setOpen(value => !value)}>
      <span>{ru ? 'Двухфакторная защита' : 'Two-factor authentication'}</span><strong>{status ? status.enabled ? 'ON' : 'OFF' : '…'}</strong>
    </button>
    {open ? <div className="two-factor-settings__body">
      <p>{ru ? 'Код из приложения-аутентификатора после пароля. Для обычных пользователей вход не меняется.' : 'An authenticator code after your password. Other members keep their usual sign-in.'}</p>
      {status?.enabled ? <p>{ru ? `Осталось резервных кодов: ${status.recoveryCodesRemaining}.` : `Recovery codes remaining: ${status.recoveryCodesRemaining}.`}</p> : null}
      {recovery.length ? <div>
        <h2>{ru ? 'Одноразовые резервные коды' : 'One-time recovery codes'}</h2>
        <pre className="two-factor-settings__codes">{recovery.join('\n')}</pre>
        <div className="two-factor-settings__buttons"><button type="button" onClick={download}>{ru ? 'Скачать коды' : 'Download codes'}</button><button type="button" onClick={() => { setRecovery([]); setMessage(''); }}>{ru ? 'Я сохранил коды' : 'I saved the codes'}</button></div>
      </div> : status ? <form className="auth-form" onSubmit={submit}>
        <div className="field"><label htmlFor="two-factor-password">{ru ? 'Текущий пароль' : 'Current password'}</label><input id="two-factor-password" type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} required maxLength={1024} /></div>
        {setup ? <div>
          <img className="two-factor-settings__qr" src={setup.qrDataUrl} width={256} height={256} alt={ru ? 'QR-код для подключения аутентификатора' : 'Authenticator setup QR code'} />
          <p>{ru ? 'Или введи ключ вручную в приложении:' : 'Or enter this key manually in your authenticator:'}</p><code className="two-factor-settings__secret">{setup.secret}</code>
          <p>{ru ? 'Это секретный ключ — не отправляй его другим людям.' : 'This key is private. Do not share it.'}</p>
        </div> : null}
        {setup || status.enabled ? <div className="field"><label htmlFor="two-factor-code">{setup ? ru ? 'Код из нового аутентификатора' : 'Code from the new authenticator' : ru ? 'Текущий код или резервный код' : 'Current authenticator or recovery code'}</label><input id="two-factor-code" autoComplete="one-time-code" value={code} onChange={event => setCode(event.target.value)} required maxLength={64} spellCheck={false} /></div> : null}
        <div className="two-factor-settings__buttons">
          <button type="submit" disabled={busy || !password}>{busy ? '…' : setup ? ru ? 'Подтвердить новый аутентификатор' : 'Confirm new authenticator' : status.enabled ? ru ? 'Подключить новый телефон' : 'Connect a new phone' : ru ? 'Начать настройку' : 'Set up'}</button>
          {setup ? <button type="button" disabled={busy} onClick={() => { setSetup(null); setCode(''); setMessage(''); }}>{ru ? 'Начать заново' : 'Start again'}</button> : status.enabled ? <>
            <button type="button" disabled={busy || !password || !code} onClick={() => void run('recovery')}>{ru ? 'Новые резервные коды' : 'New recovery codes'}</button>
            <button type="button" disabled={busy || !password || !code} onClick={() => void run('disable')}>{ru ? 'Отключить защиту' : 'Disable protection'}</button>
          </> : null}
        </div>
      </form> : null}
      {message ? <p role="status">{message}</p> : null}
      <p className="muted">{ru ? 'При потере телефона войди с резервным кодом и подключи новый. Если нет и резервных кодов, восстановление возможно через доступ владельца к VPS.' : 'If your phone is lost, sign in with a recovery code and connect a new one. Without recovery codes, the owner can reset protection through VPS access.'}</p>
    </div> : null}
  </div>;
}
