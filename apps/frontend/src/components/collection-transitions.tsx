'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import './collection-transitions.css';

// Keep the outgoing frame until the destination has real content, not loading.tsx.
export function CollectionTransitions() {
  const router = useRouter();
  useEffect(() => {
    let busy = false;
    let finish: (() => void) | undefined;
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element).closest<HTMLAnchorElement>('a[href]');
      if (!link || link.target || link.hasAttribute('download') || !link.closest('.paper-archive,.paper-section-page')) return;
      const url = new URL(link.href);
      if (url.origin !== location.origin || !['/', '/mixes', '/favorites'].includes(url.pathname)) return;
      if (url.pathname === '/') url.searchParams.set('skin', 'shelf');
      if (!document.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      event.preventDefault();
      event.stopPropagation();
      if (busy) return;
      busy = true;
      const transition = document.startViewTransition(() => new Promise<void>(resolve => {
        let timer: ReturnType<typeof setTimeout>;
        const observer = new MutationObserver(() => {
          if (location.pathname === url.pathname && !document.querySelector('[aria-label="Загрузка коллекции"]') && document.querySelector('.paper-archive,.paper-section-page')) finish?.();
        });
        finish = () => { observer.disconnect(); clearTimeout(timer); resolve(); finish = undefined; };
        observer.observe(document.body, {childList:true, subtree:true});
        timer = setTimeout(() => finish?.(), 8000);
        router.push(url.pathname + url.search, {scroll:false});
      }));
      void transition.finished.catch(() => {}).finally(() => {busy = false;});
    };
    document.addEventListener('click', onClick, true);
    return () => {document.removeEventListener('click', onClick, true); finish?.();};
  }, [router]);
  return null;
}
