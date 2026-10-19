'use client';

import Link from 'next/link';
import { createContext, useContext, useMemo, useState } from 'react';
import { getBrowserSiteLang } from '../lib/language';
import { AuthUser } from '../types';

type AuthContextValue = {
  user: AuthUser | null;
  setUser: (user: AuthUser | null) => void;
  requireAuth: () => boolean;
  requirePlayback: (isPublicMix?: boolean, isOriginal?: boolean) => boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({
  children,
  initialUser,
  playbackRequiresRegistration = true,
  allowGuestMixPlayback = false,
}: {
  children: React.ReactNode;
  initialUser: AuthUser | null;
  playbackRequiresRegistration?: boolean;
  allowGuestMixPlayback?: boolean;
}) {
  const lang = getBrowserSiteLang();
  const [user, setUser] = useState<AuthUser | null>(initialUser);
  const [isPromptOpen, setIsPromptOpen] = useState(false);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      setUser,
      requirePlayback: (isPublicMix = false, isOriginal = false) => {
        if (user || isOriginal || (isPublicMix ? allowGuestMixPlayback : !playbackRequiresRegistration)) return true;
        setIsPromptOpen(true);
        return false;
      },
      requireAuth: () => {
        if (user) {
          return true;
        }

        setIsPromptOpen(true);
        return false;
      },
    }),
    [user, playbackRequiresRegistration, allowGuestMixPlayback],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
      {isPromptOpen ? (
        <div className="auth-overlay" role="dialog" aria-modal="true" onClick={() => setIsPromptOpen(false)}>
          <div className="auth-prompt release-panel" onClick={(event) => event.stopPropagation()}>
            <p className="muted">
              {lang === 'ru'
                ? 'Для прослушивания этой записи нужно войти.'
                : 'Sign in to listen to this recording.'}
            </p>
            <h2>{lang === 'ru' ? 'Войти или создать аккаунт' : 'Sign in or create an account'}</h2>
            <p className="muted">
              {lang === 'ru'
                ? allowGuestMixPlayback ? 'Миксы можно слушать без регистрации. Для закрытых записей, плейлистов и избранного нужно войти.' : 'Коллекцию можно смотреть свободно. Для закрытых записей, плейлистов и избранного нужно войти.'
                : allowGuestMixPlayback ? 'Mixes are available without an account. Sign in for restricted recordings, playlists and favorites.' : 'Browse the collection freely. Sign in for restricted recordings, playlists and favorites.'}
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
