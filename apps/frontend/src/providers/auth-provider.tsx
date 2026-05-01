'use client';

import Link from 'next/link';
import { createContext, useContext, useMemo, useState } from 'react';
import { getBrowserSiteLang } from '../lib/language';
import { AuthUser } from '../types';

type AuthContextValue = {
  user: AuthUser | null;
  setUser: (user: AuthUser | null) => void;
  requireAuth: () => boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({
  children,
  initialUser,
}: {
  children: React.ReactNode;
  initialUser: AuthUser | null;
}) {
  const lang = getBrowserSiteLang();
  const [user, setUser] = useState<AuthUser | null>(initialUser);
  const [isPromptOpen, setIsPromptOpen] = useState(false);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      setUser,
      requireAuth: () => {
        if (user) {
          return true;
        }

        setIsPromptOpen(true);
        return false;
      },
    }),
    [user],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
      {isPromptOpen ? (
        <div className="auth-overlay" role="dialog" aria-modal="true" onClick={() => setIsPromptOpen(false)}>
          <div className="auth-prompt release-panel" onClick={(event) => event.stopPropagation()}>
            <p className="muted">
              {lang === 'ru'
                ? 'Прослушивание доступно зарегистрированным пользователям.'
                : 'Playback is available for registered users.'}
            </p>
            <h2>{lang === 'ru' ? 'Войти или создать аккаунт' : 'Sign in or create an account'}</h2>
            <p className="muted">
              {lang === 'ru'
                ? 'Коллекцию можно смотреть свободно, но прослушивание, плейлисты и избранное доступны после входа.'
                : 'You can browse the collection freely, but listening, playlists and favorites require an account.'}
            </p>
            <div className="auth-prompt__actions">
              <Link href="/profile?mode=login" className="auth-prompt__button" onClick={() => setIsPromptOpen(false)}>
                {lang === 'ru' ? 'Войти' : 'Sign in'}
              </Link>
              <Link
                href="/profile?mode=register"
                className="auth-prompt__button"
                onClick={() => setIsPromptOpen(false)}
              >
                {lang === 'ru' ? 'Регистрация' : 'Register'}
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }

  return context;
}
