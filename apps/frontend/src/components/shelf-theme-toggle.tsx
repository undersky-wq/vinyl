'use client';

import { Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';

type ShelfTheme = 'light' | 'dark';

const STORAGE_KEY = 'mityadima-shelf-theme';

function applyTheme(theme: ShelfTheme) {
  document.documentElement.dataset.shelfTheme = theme;
  document.documentElement.style.colorScheme = theme;
}

export function ShelfThemeToggle({ compact = false, iconOnly = false }: { compact?: boolean; iconOnly?: boolean }) {
  const [theme, setTheme] = useState<ShelfTheme>('light');

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    const initial = stored === 'dark' ? 'dark' : 'light';
    setTheme(initial);
    applyTheme(initial);
  }, []);

  function toggleTheme() {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    window.localStorage.setItem(STORAGE_KEY, next);
    applyTheme(next);
  }

  const dark = theme === 'dark';
  return (
    <button
      type="button"
      className={`shelf-theme-toggle${compact ? ' shelf-theme-toggle--compact' : ''}`}
      aria-pressed={dark}
      aria-label={dark ? 'Use light theme' : 'Use dark theme'}
      onClick={toggleTheme}
    >
      {dark ? <Sun size={iconOnly ? 18 : 13} /> : <Moon size={iconOnly ? 18 : 13} />}
      {iconOnly ? null : <span>{dark ? 'Light' : 'Dark'}</span>}
    </button>
  );
}
