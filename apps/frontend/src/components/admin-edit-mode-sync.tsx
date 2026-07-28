'use client';

import { useEffect } from 'react';

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
