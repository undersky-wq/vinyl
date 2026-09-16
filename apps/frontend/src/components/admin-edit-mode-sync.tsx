'use client';

import { useEffect, useState } from 'react';

export const WEB_EDIT_MODE_KEY = 'vinyl-admin-web-edit-mode';
export const WEB_EDIT_MODE_EVENT = 'vinyl-admin-web-edit-mode-change';
export function setWebEditMode(enabled: boolean) {
  localStorage.setItem(WEB_EDIT_MODE_KEY, enabled ? 'on' : 'off');
  window.dispatchEvent(new Event(WEB_EDIT_MODE_EVENT));
}
export function useWebEditMode() {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    const sync = () => setEnabled(localStorage.getItem(WEB_EDIT_MODE_KEY) === 'on');
    sync();
    window.addEventListener(WEB_EDIT_MODE_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(WEB_EDIT_MODE_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);
  return enabled;
}

export const ADMIN_EDIT_MODE_STORAGE_KEY = 'vinyl-admin-mobile-edit-mode';
export const ADMIN_EDIT_MODE_EVENT = 'vinyl-admin-mobile-edit-mode-change';

export function setAdminEditModeClass(enabled: boolean) {
  document.documentElement.classList.toggle('admin-mobile-edit-off', !enabled);
}

export function AdminEditModeSync() {
  useEffect(() => {
    const sync = () => {
      const storedValue = window.localStorage.getItem(ADMIN_EDIT_MODE_STORAGE_KEY);
      setAdminEditModeClass(storedValue !== 'off');
    };

    sync();
    window.addEventListener(ADMIN_EDIT_MODE_EVENT, sync);
    window.addEventListener('storage', sync);

    return () => {
      window.removeEventListener(ADMIN_EDIT_MODE_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  return null;
}
