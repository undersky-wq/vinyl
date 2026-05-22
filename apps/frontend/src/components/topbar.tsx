'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AudioLines, Heart, House, Library, ListMusic, Search, UserRound } from 'lucide-react';
import { getSearchSuggestions } from '../lib/api';
import { SiteLang } from '../lib/language';
import { useAuth } from '../providers/auth-provider';
import { SearchSuggestion } from '../types';
import { LanguageSwitcher } from './language-switcher';

type TopbarProps = {
  lang: SiteLang;
  search?: string;
  active?: 'home' | 'library' | 'playlists' | 'mixes' | 'favorites' | 'upload' | 'profile';
  hideSearch?: boolean;
};

function getNavClass(isActive: boolean) {
  return `nav-link${isActive ? ' active' : ''}`;
}

export function Topbar({ lang, search, active, hideSearch = false }: TopbarProps) {
  const { user } = useAuth();
  const router = useRouter();
  const [searchValue, setSearchValue] = useState(search ?? '');
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [isSuggestionsOpen, setIsSuggestionsOpen] = useState(false);
  const searchRef = useRef<HTMLFormElement | null>(null);

  useEffect(() => {
    setSearchValue(search ?? '');
  }, [search]);

  useEffect(() => {
    const normalizedSearch = searchValue.trim();
    if (normalizedSearch.length < 2) {
      setSuggestions([]);
      setIsSuggestionsOpen(false);
      return;
    }

    let isCancelled = false;
    const timer = setTimeout(async () => {
      try {
        const nextSuggestions = await getSearchSuggestions(normalizedSearch);
        if (!isCancelled) {
          setSuggestions(nextSuggestions);
          setIsSuggestionsOpen(nextSuggestions.length > 0);
        }
      } catch {
        if (!isCancelled) {
          setSuggestions([]);
          setIsSuggestionsOpen(false);
        }
      }
    }, 220);

    return () => {
      isCancelled = true;
      clearTimeout(timer);
    };
  }, [searchValue]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (searchRef.current && !searchRef.current.contains(target)) {
        setIsSuggestionsOpen(false);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedSearch = searchValue.trim();
    const target = normalizedSearch ? `/?search=${encodeURIComponent(normalizedSearch)}` : '/';
    setIsSuggestionsOpen(false);
    router.push(target, { scroll: false });
  }

  function applySuggestion(suggestion: SearchSuggestion) {
    setSearchValue(suggestion.search);
    setIsSuggestionsOpen(false);
    router.push(`/?search=${encodeURIComponent(suggestion.search)}`, { scroll: false });
  }

  return (
    <div className="topbar">
      <Link href="/" className="brand-link">
        {lang === 'ru' ? 'Коллекция винила' : 'Vinyl Collection'}
      </Link>

      <nav className="topbar__nav" aria-label={lang === 'ru' ? 'Основная навигация' : 'Primary navigation'}>
        <Link href="/" className={getNavClass(active === 'home')}>
          <House size={19} />
          <span>{lang === 'ru' ? 'Главная' : 'Home'}</span>
        </Link>
        <Link href="/library" className={getNavClass(active === 'library')}>
          <Library size={19} />
          <span>{lang === 'ru' ? 'Библиотека' : 'Library'}</span>
        </Link>
        <Link href="/playlists" className={getNavClass(active === 'playlists')}>
          <ListMusic size={19} />
          <span>{lang === 'ru' ? 'Плейлисты' : 'Playlists'}</span>
        </Link>
        <Link href="/mixes" className={getNavClass(active === 'mixes')}>
          <AudioLines size={19} />
          <span className="topbar__mix-label-fixed">{lang === 'ru' ? 'Миксы' : 'Mixes'}</span>
          <span>{lang === 'ru' ? 'РњРёРєСЃС‹' : 'Mixes'}</span>
        </Link>
        <Link href="/favorites" className={getNavClass(active === 'favorites')}>
          <Heart size={19} />
          <span>{lang === 'ru' ? 'Избранное' : 'Favourites'}</span>
        </Link>
      </nav>

      {hideSearch ? (
        <div className="topbar__spacer" aria-hidden="true" />
      ) : (
        <form className="topbar__search" onSubmit={handleSubmit} ref={searchRef}>
          <Search size={18} className="topbar__search-icon" />
          <input
            className="search-input"
            name="search"
            value={searchValue}
            placeholder={lang === 'ru' ? 'Поиск треков...' : 'Search tracks...'}
            onChange={(event) => setSearchValue(event.target.value)}
            onFocus={() => setIsSuggestionsOpen(suggestions.length > 0)}
          />
          {isSuggestionsOpen && suggestions.length ? (
            <div className="search-suggestions">
              {suggestions.map((suggestion) => (
                <button
                  type="button"
                  className="search-suggestion"
                  key={suggestion.id}
                  onClick={() => applySuggestion(suggestion)}
                >
                  <span>
                    <strong>{suggestion.label}</strong>
                    <small>{suggestion.meta}</small>
                  </span>
                  <em>
                    {suggestion.type === 'artist'
                      ? lang === 'ru'
                        ? 'артист'
                        : 'artist'
                      : suggestion.type === 'release'
                        ? lang === 'ru'
                          ? 'релиз'
                          : 'release'
                        : lang === 'ru'
                          ? 'трек'
                          : 'track'}
                  </em>
                </button>
              ))}
            </div>
          ) : null}
        </form>
      )}

      <Link
        href="/profile"
        className={`icon-link${active === 'profile' ? ' active' : ''}`}
        aria-label={lang === 'ru' ? 'Профиль' : 'Profile'}
        onClick={(event) => {
          event.preventDefault();
          router.push('/profile', { scroll: false });
        }}
      >
        {user?.avatarStorageUrl ? (
          <img src={user.avatarStorageUrl} alt={user.displayName} className="topbar-avatar" />
        ) : user ? (
          <span className="topbar-avatar topbar-avatar--fallback">
            {user.displayName.slice(0, 1).toUpperCase()}
          </span>
        ) : (
          <UserRound size={20} />
        )}
      </Link>

      <LanguageSwitcher lang={lang} />
    </div>
  );
}
