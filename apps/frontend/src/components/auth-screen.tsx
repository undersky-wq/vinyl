'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getSiteSettings, loginUser, registerUser } from '../lib/api';
import { SiteLang } from '../lib/language';
import { useAuth } from '../providers/auth-provider';

export function AuthScreen({
  lang,
  mode,
  initialInviteRequired = null,
}: {
  lang: SiteLang;
  mode: 'login' | 'register';
  initialInviteRequired?: boolean | null;
}) {
  const router = useRouter();
  const { setUser } = useAuth();
  const [currentMode, setCurrentMode] = useState<'login' | 'register'>(mode);
  const [status, setStatus] = useState('');
  const [isPending, setIsPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [needsTwoFactor, setNeedsTwoFactor] = useState(false);
  const [inviteRequired, setInviteRequired] = useState(initialInviteRequired);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsFailed, setSettingsFailed] = useState(false);
  const [settingsAttempt, setSettingsAttempt] = useState(0);
  const isRu = lang === 'ru';
  const isLogin = currentMode === 'login';

  useEffect(() => {
    if (currentMode !== 'register') return;
    let active = true;
    let refreshing = false;
    const refresh = async () => {
      if (refreshing) return;
      refreshing = true;
      setSettingsLoading(true);
      try {
        const settings = await getSiteSettings();
        if (typeof settings.registrationInviteRequired !== 'boolean') throw new Error('Registration settings unavailable');
        if (active) { setInviteRequired(settings.registrationInviteRequired); setSettingsFailed(false); }
      } catch {
        if (active) setSettingsFailed(true);
      } finally {
        refreshing = false;
        if (active) setSettingsLoading(false);
      }
    };
    const visible = () => { if (!document.hidden) void refresh(); };
    void refresh();
    window.addEventListener('focus', visible);
    document.addEventListener('visibilitychange', visible);
    return () => {
      active = false;
      window.removeEventListener('focus', visible);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [currentMode, settingsAttempt]);

  const copy = {
    eyebrow: isLogin
      ? isRu
        ? 'Доступ для пользователя'
        : 'Member access'
      : isRu
        ? 'Регистрация'
        : 'Registration',
    title: isLogin ? (isRu ? 'Вход' : 'Sign in') : isRu ? 'Создать аккаунт' : 'Create account',
    description: isLogin
      ? isRu
        ? 'Зарегистрированные пользователи могут слушать треки, сохранять избранное и создавать плейлисты.'
        : 'Registered users can listen to tracks, save favorites and build personal playlists.'
      : isRu
        ? 'Создай аккаунт, чтобы слушать треки, сохранять избранное и собирать личные плейлисты.'
        : 'Create an account to listen to tracks, save favorites and build personal playlists.',
    displayName: isRu ? 'Имя' : 'Display name',
    loginName: isRu ? 'Почта' : 'Email',
    password: isRu ? 'Пароль' : 'Password',
    showPassword: isRu ? 'Показать' : 'Show',
    hidePassword: isRu ? 'Скрыть' : 'Hide',
    inviteCode: isRu ? 'Инвайт-код администратора' : 'Admin invite code',
    privacyConsent: isRu
      ? 'Я даю согласие на обработку персональных данных.'
      : 'I consent to personal data processing.',
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
            if (!isLogin && (inviteRequired === null || settingsLoading || settingsFailed)) return;
            const form = new FormData(event.currentTarget);
            const payload = {
              email: String(form.get('email') || ''),
              password: String(form.get('password') || ''),
              displayName: String(form.get('displayName') || ''),
              inviteCode: !isLogin && inviteRequired ? String(form.get('inviteCode') || '').trim() || undefined : undefined,
              privacyConsent: form.get('privacyConsent') === 'on',
            };

            setStatus('');
            setIsPending(true);

            try {
              const user = isLogin
                ? await loginUser({ email: payload.email, password: payload.password, code: String(form.get('code') || '').trim() || undefined })
                : await registerUser(payload);
              setUser(user);
              router.push('/profile');
              router.refresh();
            } catch (error) {
              const message = error instanceof Error ? error.message : '';
              if (message === 'TWO_FACTOR_REQUIRED') {
                setNeedsTwoFactor(true);
                setStatus(isRu ? 'Введи код из аутентификатора или одноразовый резервный код.' : 'Enter an authenticator code or a one-time recovery code.');
              } else if (message === 'TWO_FACTOR_INVALID') {
                setStatus(isRu ? 'Неверный или уже использованный код. Дождись нового кода или используй резервный.' : 'Invalid or already used code. Wait for a new code or use a recovery code.');
              } else if (message === 'TWO_FACTOR_LOCKED') {
                setStatus(isRu ? 'Слишком много попыток. Попробуй через 15 минут.' : 'Too many attempts. Try again in 15 minutes.');
              } else setStatus(copy.failed);
            } finally {
              setIsPending(false);
            }
          }}
        >
          {isLogin && needsTwoFactor ? <div className="field">
            <label htmlFor="code">{isRu ? 'Код аутентификатора или резервный код' : 'Authenticator or recovery code'}</label>
            <input id="code" name="code" autoComplete="one-time-code" autoFocus required maxLength={64} spellCheck={false} autoCapitalize="characters" />
          </div> : null}

          {currentMode === 'register' ? (
            <div className="field">
              <label htmlFor="displayName">{copy.displayName}</label>
              <input id="displayName" name="displayName" required />
            </div>
          ) : null}

          <div className="field">
            <label htmlFor="email">{copy.loginName}</label>
            <input id="email" name="email" type="email" autoComplete="email" required />
          </div>

          <div className="field">
            <label htmlFor="password">{copy.password}</label>
            <div className="auth-password-field">
              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete={isLogin ? 'current-password' : 'new-password'}
                minLength={8}
                required
              />
              <button
                type="button"
                className="auth-password-toggle"
                aria-controls="password"
                aria-label={isRu ? 'Показать пароль' : 'Show password'}
                aria-pressed={showPassword}
                onClick={() => setShowPassword((visible) => !visible)}
              >
                {showPassword ? copy.hidePassword : copy.showPassword}
              </button>
            </div>
          </div>

          {currentMode === 'register' && inviteRequired === true ? (
            <div className="field">
              <label htmlFor="inviteCode">{copy.inviteCode}</label>
              <input
                id="inviteCode"
                name="inviteCode"
                required
                autoComplete="off"
              />
            </div>
          ) : null}

          {currentMode === 'register' ? (
            <label className="auth-consent">
              <input name="privacyConsent" type="checkbox" required />
              <span>{copy.privacyConsent} <a href="/consent" target="_blank" rel="noreferrer">{isRu ? 'Текст согласия' : 'Read consent'}</a></span>
            </label>
          ) : null}

          {currentMode === 'register' ? (
            <p className="auth-consent">
              <span>
              {isRu ? 'Сведения об обработке данных: ' : 'Information about data processing: '}
              <a href="/privacy" target="_blank" rel="noreferrer">{isRu ? 'Политика обработки персональных данных' : 'Privacy Policy'}</a>.
              </span>
            </p>
          ) : null}

          {!isLogin && settingsFailed ? <div className="field" role="alert">
            <p className="muted">{isRu ? 'Не удалось загрузить настройки регистрации.' : 'Unable to load registration settings.'}</p>
            <button type="button" className="auth-mode-switch" disabled={settingsLoading} onClick={() => setSettingsAttempt(value => value + 1)}>
              {isRu ? 'Повторить' : 'Try again'}
            </button>
          </div> : null}
          <button className="primary-button auth-submit-button" type="submit" disabled={isPending || (!isLogin && (inviteRequired === null || settingsLoading || settingsFailed))}>
            {copy.submit}
          </button>
          {status ? <p className="muted">{status}</p> : null}
        </form>

        <button
          type="button"
          className="auth-mode-switch"
          onClick={() => {
            setCurrentMode((current) => (current === 'login' ? 'register' : 'login'));
            setShowPassword(false);
            setNeedsTwoFactor(false);
            setStatus('');
          }}
        >
          {copy.switchMode}
        </button>
      </article>
    </section>
  );
}
