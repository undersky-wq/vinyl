type PrefetchRouter = { prefetch: (href: string) => void };

export function installNavigationPrefetch(router: PrefetchRouter, root: Document = document) {
  const warmed = new Set<string>();
  const prefetch = (event: Event) => {
    if (event.type === 'pointerover' && (event as PointerEvent).pointerType !== 'mouse') return;
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    if (connection?.saveData || /(^|-)2g$/.test(connection?.effectiveType || '')) return;
    if (!(event.target instanceof Element)) return;
    const target = event.target.closest<HTMLAnchorElement | HTMLButtonElement>('a[href],.paper-sections>button');
    if (!target || target.hasAttribute('download') || target.getAttribute('target')) return;
    const sectionRoutes: Record<string, string> = {
      'paper-section-collection': '/', 'paper-section-mixes': '/mixes',
      'paper-section-originals': '/tracks', 'paper-section-favorites': '/favorites',
    };
    const href = target.getAttribute('href') || (target.getAttribute('aria-controls') === 'paper-playlists-panel'
      ? '/?view=playlists' : Object.entries(sectionRoutes).find(([name]) => target.classList.contains(name))?.[1]);
    if (!href) return;
    const url = new URL(href, location.href);
    if (url.origin !== location.origin || !['/', '/mixes', '/tracks', '/favorites', '/about'].includes(url.pathname)) return;
    const destination = url.pathname + url.search;
    if (destination === location.pathname + location.search || warmed.has(destination)) return;
    warmed.add(destination);
    router.prefetch(destination);
  };
  root.addEventListener('pointerover', prefetch, { passive: true });
  root.addEventListener('focusin', prefetch);
  return () => {
    root.removeEventListener('pointerover', prefetch);
    root.removeEventListener('focusin', prefetch);
  };
}
