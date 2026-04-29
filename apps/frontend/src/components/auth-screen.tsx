'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { loginUser, registerUser } from '../lib/api';
import { SiteLang } from '../lib/language';
import { useAuth } from '../providers/auth-provider';

export function AuthScreen({
  lang,
  mode,
}: {
  lang: SiteLang;
  mode: 'login' | 'register';
}) {
  const router = useRouter();
  const { setUser } = useAuth();
  const [currentMode, setCurrentMode] = useState<'login' | 'register'>(mode);
  const [status, setStatus] = useState('');
  const [isPending, setIsPending] = useState(false);

  return (
    <section className="auth-grid">
      <article className="release-panel auth-panel">
        <p className="muted">{currentMode === 'login' ? 'Member access' : 'Invite registration'}</p>
        <h1 className="profile-title">{currentMode === 'login' ? 'Sign in' : 'Create account'}</h1>
        <p className="muted">
          {currentMode === 'login'
            ? 'Registered users can listen to tracks, save favorites and build personal playlists.'
            : 'New users need your invite code, then they get their own playlists, favorites and profile.'}
        </p>

        <form
          className="auth-form"
          onSubmit={async (event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const payload = {
              email: String(form.get('email') || ''),
              password: String(form.get('password') || ''),
              displayName: String(form.get('displayName') || ''),
              inviteCode: String(form.get('inviteCode') || ''),
            };

            setStatus('');
            setIsPending(true);

            try {
              const user =
                currentMode === 'login'
                  ? await loginUser({ email: payload.email, password: payload.password })
                  : await registerUser(payload);
              setUser(user);
              router.push('/profile');
              router.refresh();
            } catch {
              setStatus(currentMode === 'login' ? 'Login failed.' : 'Registration failed.');
            } finally {
              setIsPending(false);
            }
          }}
        >
          {currentMode === 'register' ? (
            <div className="field">
              <label htmlFor="displayName">{lang === 'ru' ? 'Имя' : 'Display name'}</label>
              <input id="displayName" name="displayName" required />
            </div>
          ) : null}

          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" name="email" type="email" required />
          </div>

          <div className="field">
            <label htmlFor="password">{lang === 'ru' ? 'Пароль' : 'Password'}</label>
            <input id="password" name="password" type="password" minLength={8} required />
          </div>

          {currentMode === 'register' ? (
            <div className="field">
              <label htmlFor="inviteCode">{lang === 'ru' ? 'Инвайт-код' : 'Invite code'}</label>
              <input id="inviteCode" name="inviteCode" required />
            </div>
          ) : null}

          <button className="primary-button auth-submit-button" type="submit" disabled={isPending}>
            {currentMode === 'login' ? 'Sign in' : 'Register'}
          </button>
          {status ? <p className="muted">{status}</p> : null}
        </form>

        <button
          type="button"
          className="auth-mode-switch"
          onClick={() => setCurrentMode((current) => (current === 'login' ? 'register' : 'login'))}
        >
          {currentMode === 'login' ? 'Need an account?' : 'Already have an account?'}
        </button>
      </article>
    </section>
  );
}
