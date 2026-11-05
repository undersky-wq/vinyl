'use client';

import { Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';

type ShelfTheme = 'light' | 'dark';

const STORAGE_KEY = 'mityadima-shelf-theme';
let themePaintFrame = 0;

function applyTheme(theme: ShelfTheme) {
  const root = document.documentElement;
  if (root.dataset.shelfTheme !== theme) {
    if (themePaintFrame) window.cancelAnimationFrame(themePaintFrame);
    root.dataset.shelfThemeChanging = 'true';
    // Install the transition guard before changing either theme color.
    void root.offsetWidth;
    root.dataset.shelfTheme = theme;
    themePaintFrame = window.requestAnimationFrame(() => {
      themePaintFrame = window.requestAnimationFrame(() => {
        delete root.dataset.shelfThemeChanging;
        themePaintFrame = 0;
      });
    });
  }
  root.style.colorScheme = theme;
}

export function ShelfThemeToggle({ compact = false, iconOnly = false }: { compact?: boolean; iconOnly?: boolean }) {
  const [theme, setTheme] = useState<ShelfTheme>('light');

  useEffect(() => {
    let stored = document.documentElement.dataset.shelfTheme;
    try { stored = window.localStorage.getItem(STORAGE_KEY) ?? stored; } catch { /* Keep the current page theme. */ }
    const initial = stored === 'dark' ? 'dark' : 'light';
    setTheme(initial);
    applyTheme(initial);
  }, []);

  function toggleTheme() {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    applyTheme(next);
    try { window.localStorage.setItem(STORAGE_KEY, next); } catch { /* The theme still applies for this page. */ }
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
