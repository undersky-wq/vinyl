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
  const isRu = lang === 'ru';
  const isLogin = currentMode === 'login';

  const copy = {
    eyebrow: isLogin
      ? isRu
        ? 'Доступ для пользователя'
        : 'Member access'
      : isRu
        ? 'Регистрация по инвайту'
        : 'Invite registration',
    title: isLogin ? (isRu ? 'Вход' : 'Sign in') : isRu ? 'Создать аккаунт' : 'Create account',
    description: isLogin
      ? isRu
        ? 'Зарегистрированные пользователи могут слушать треки, сохранять избранное и создавать плейлисты.'
        : 'Registered users can listen to tracks, save favorites and build personal playlists.'
      : isRu
        ? 'Для регистрации нужен инвайт-код. После входа будут доступны личные плейлисты, избранное и профиль.'
        : 'New users need your invite code, then they get their own playlists, favorites and profile.',
    displayName: isRu ? 'Имя' : 'Display name',
    password: isRu ? 'Пароль' : 'Password',
    inviteCode: isRu ? 'Инвайт-код' : 'Invite code',
    submit: isLogin ? (isRu ? 'Войти' : 'Sign in') : isRu ? 'Зарегистрироваться' : 'Register',
    failed: isLogin ? (isRu ? 'Не удалось войти.' : 'Login failed.') : isRu ? 'Не удалось зарегистрироваться.' : 'Registration failed.',
    switchMode: isLogin ? (isRu ? 'Нужен аккаунт?' : 'Need an account?') : isRu ? 'Уже есть аккаунт?' : 'Already have an account?',
  };

  return (
    <section className="auth-grid">
      <article className="release-panel auth-panel">
        <p className="muted">{copy.eyebrow}</p>
        <h1 className="profile-title">{copy.title}</h1>
        <p className="muted">{copy.description}</p>

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
              const user = isLogin
                ? await loginUser({ email: payload.email, password: payload.password })
                : await registerUser(payload);
              setUser(user);
              router.push('/profile');
              router.refresh();
            } catch {
              setStatus(copy.failed);
            } finally {
              setIsPending(false);
            }
          }}
        >
          {currentMode === 'register' ? (
            <div className="field">
              <label htmlFor="displayName">{copy.displayName}</label>
              <input id="displayName" name="displayName" required />
            </div>
          ) : null}

          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" name="email" type="email" required />
          </div>

          <div className="field">
            <label htmlFor="password">{copy.password}</label>
            <input id="password" name="password" type="password" minLength={8} required />
          </div>

          {currentMode === 'register' ? (
            <div className="field">
              <label htmlFor="inviteCode">{copy.inviteCode}</label>
              <input id="inviteCode" name="inviteCode" required />
            </div>
          ) : null}

          <button className="primary-button auth-submit-button" type="submit" disabled={isPending}>
            {copy.submit}
          </button>
          {status ? <p className="muted">{status}</p> : null}
        </form>

        <button
          type="button"
          className="auth-mode-switch"
          onClick={() => setCurrentMode((current) => (current === 'login' ? 'register' : 'login'))}
        >
          {copy.switchMode}
        </button>
      </article>
    </section>
  );
}
