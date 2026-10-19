'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import './collection-transitions.css';
import { SiteLang } from '../lib/language';

// Keep the outgoing frame until the destination has real content, not loading.tsx.
export function CollectionTransitions({ lang = 'en' }: { lang?: SiteLang }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, setPending] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navigationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    router.prefetch('/');
    router.prefetch('/mixes');
    router.prefetch('/tracks');
    router.prefetch('/favorites');
    router.prefetch('/about');
  }, [router]);

  useEffect(() => {
    setPending(false);
    document.documentElement.removeAttribute('data-collection-navigating');
    document.documentElement.removeAttribute('data-about-navigating');
    if (timer.current) clearTimeout(timer.current);
    if (navigationTimer.current) { clearTimeout(navigationTimer.current); navigationTimer.current = null; }
  }, [pathname]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element).closest<HTMLAnchorElement>('a[href]');
      if (!link || link.target || link.hasAttribute('download')) return;
      const url = new URL(link.href);
      if (url.origin === location.origin && url.pathname === '/about' && location.pathname !== '/about') {
        event.preventDefault();
        if (navigationTimer.current) return;
        const reduced = matchMedia('(prefers-reduced-motion:reduce)').matches;
        document.documentElement.setAttribute('data-about-navigating', 'true');
        navigationTimer.current = setTimeout(() => {
          navigationTimer.current = null;
          router.push(url.pathname + url.search, {scroll:false});
          timer.current = setTimeout(() => document.documentElement.removeAttribute('data-about-navigating'), 10000);
        }, reduced ? 0 : 320);
        return;
      }
      if (!link.closest('.paper-archive,.paper-section-page')) return;
      if (url.origin !== location.origin || !['/', '/mixes', '/tracks', '/favorites'].includes(url.pathname)) return;
      if (url.pathname === location.pathname && url.search === location.search) return;
      event.preventDefault();
      if (document.documentElement.hasAttribute('data-collection-navigating')) return;
      document.documentElement.setAttribute('data-collection-navigating', 'true');
      setPending(true);
      requestAnimationFrame(() => {
        router.push(url.pathname + url.search, {scroll:false});
      });
      timer.current = setTimeout(() => {
        document.documentElement.removeAttribute('data-collection-navigating');
        setPending(false);
      }, 10000);
    };
    document.addEventListener('click', onClick, true);
    return () => {
      document.removeEventListener('click', onClick, true);
      if (timer.current) clearTimeout(timer.current);
      if (navigationTimer.current) clearTimeout(navigationTimer.current);
      document.documentElement.removeAttribute('data-about-navigating');
    };
  }, [router]);
  return <div className="collection-route-loader" role="status" aria-live="polite" aria-label={lang === 'ru' ? 'Загрузка страницы' : 'Loading page'} aria-hidden={!pending}>
    <div className="collection-route-loader__portrait" aria-hidden="true">
      <img src="/icon.png" alt="" width={56} height={56} decoding="async" />
      <svg viewBox="0 0 72 72" className="collection-route-loader__ring" focusable="false">
        <circle className="collection-route-loader__track" cx="36" cy="36" r="33" />
        <circle className="collection-route-loader__runner" cx="36" cy="36" r="33" pathLength="100" />
      </svg>
    </div>
  </div>;
}
