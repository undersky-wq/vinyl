'use client';

import { createContext, type Dispatch, type SetStateAction } from 'react';
import type { ArchivePageHeaderProps } from './archive-page-header';

export type ArchiveHeaderRegistration = { pathname: string; href: string; props: ArchivePageHeaderProps };
export const ArchiveHeaderContext = createContext<Dispatch<SetStateAction<ArchiveHeaderRegistration | null>> | null>(null);

export function archiveHeaderLocation(pathname: string, location: Pick<Location, 'pathname' | 'search' | 'hash'>) {
  // Next can retain the outgoing archive while its pathname already says About.
  // That hidden page must not replace the saved return address or controls.
  if (pathname === '/about' || pathname !== location.pathname) return null;
  return { pathname, href: location.pathname + location.search + location.hash };
}

export function cancelArchiveNavigation(timer: { current: ReturnType<typeof setTimeout> | null }) {
  if (timer.current !== null) clearTimeout(timer.current);
  timer.current = null;
}
