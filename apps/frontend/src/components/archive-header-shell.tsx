'use client';

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import type { SiteLang } from '../lib/language';
import { ArchiveHeaderContext, cancelArchiveNavigation, type ArchiveHeaderRegistration } from './archive-header-context';
import { ArchivePageHeaderView } from './archive-page-header';

export function ArchiveHeaderShell({ children, lang }: { children: ReactNode; lang: SiteLang }) {
  const pathname = usePathname();
  const router = useRouter();
  const [registration, register] = useState<ArchiveHeaderRegistration | null>(null);
  const [aboutSearch, setAboutSearch] = useState<string | null>(null);
  const navigationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const about = pathname === '/about';
  const supported = about || ['/', '/mixes', '/tracks', '/favorites', '/playlists'].includes(pathname)
    || /^\/(mixes|tracks)\/[^/]+$/.test(pathname);
  const props = registration?.props;
  const search = about ? aboutSearch ?? props?.search ?? '' : props?.search ?? '';
  useLayoutEffect(() => {
    delete document.documentElement.dataset.aboutLeaving;
    if (!about) setAboutSearch(null);
    cancelArchiveNavigation(navigationTimer);
  }, [pathname, about]);
  useEffect(() => () => cancelArchiveNavigation(navigationTimer), []);
  const leaveAbout = (href: string) => {
    if (navigationTimer.current) return;
    document.documentElement.dataset.aboutLeaving = 'true';
    navigationTimer.current = setTimeout(() => {
      navigationTimer.current = null;
      router.push(href, {scroll:false});
    }, matchMedia('(prefers-reduced-motion:reduce)').matches ? 0 : 320);
  };
  const goSearch = () => leaveAbout(`/?search=${encodeURIComponent(search)}&layout=${props?.activeLayout ?? 'shelf'}`);
  const returnToArchive = (layout = props?.activeLayout) => {
    const url = new URL(registration?.href ?? '/', location.origin);
    if (layout) url.searchParams.set('layout', layout);
    leaveAbout(url.pathname + url.search + url.hash);
  };

  return <ArchiveHeaderContext.Provider value={register}>
    {children}
    {supported && <div className="archive-chrome" data-about={about || undefined}>
      <ArchivePageHeaderView
        lang={lang} search={search} searchStatus={about ? undefined : props?.searchStatus}
        activeLayout={props?.activeLayout ?? null}
        onSearchChange={about ? setAboutSearch : props?.onSearchChange ?? setAboutSearch}
        onSearchSubmit={about ? goSearch : props?.onSearchSubmit}
        onHome={about ? () => returnToArchive() : props?.onHome ?? (() => router.push('/'))}
        onLayoutChange={about ? returnToArchive : props?.onLayoutChange ?? (layout => router.push(`/?layout=${layout}`))}
      />
    </div>}
  </ArchiveHeaderContext.Provider>;
}
