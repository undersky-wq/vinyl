'use client';

import { useEffect, useState } from 'react';

const key = 'vinyl-techno-dancer-enabled';
const changeEvent = 'vinyl-dancer-preference-change';
let enabled = true;

export function useDancerPreference() {
  const [value, setValue] = useState(false);
  useEffect(() => {
    const sync = () => {
      try { enabled = window.localStorage.getItem(key) !== 'false'; } catch { /* Keep the session preference if storage is unavailable. */ }
      setValue(enabled);
    };
    const storage = (event: StorageEvent) => { if (event.key === key || event.key === null) sync(); };
    sync();
    window.addEventListener(changeEvent, sync);
    window.addEventListener('storage', storage);
    return () => {
      window.removeEventListener(changeEvent, sync);
      window.removeEventListener('storage', storage);
    };
  }, []);

  function update(next: boolean) {
    enabled = next;
    try { window.localStorage.setItem(key, String(next)); } catch { /* Session-only when storage is blocked. */ }
    setValue(next);
    window.dispatchEvent(new Event(changeEvent));
  }
  return [value, update] as const;
}
