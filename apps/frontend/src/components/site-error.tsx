'use client';

import { useEffect, useState } from 'react';
import './record-archive.css';
import './paper-sections.css';
import './site-error.css';

export function SiteError({ reset, reload = false }: { reset: () => void; reload?: boolean }) {
  const [ru, setRu] = useState(true);
  useEffect(() => {
    setRu(document.documentElement.lang !== 'en');
    document.documentElement.dataset.visualVariant = 'shelf';
    if (!document.documentElement.dataset.shelfTheme) {
      try { document.documentElement.dataset.shelfTheme = localStorage.getItem('mityadima-shelf-theme') === 'dark' ? 'dark' : 'light'; }
      catch { document.documentElement.dataset.shelfTheme = 'light'; }
    }
  }, []);
  return <main className="paper-section-page site-error-page"><section className="site-error-panel" aria-live="polite">
    <h1>{ru ? 'Не удалось загрузить страницу' : 'Unable to load this page'}</h1>
    <p>{ru ? 'Проверьте соединение и попробуйте ещё раз.' : 'Check your connection and try again.'}</p>
    <div className="site-error-actions"><button type="button" onClick={() => reload ? window.location.reload() : reset()}>
      {ru ? 'Попробовать снова' : 'Try again'}
    </button>
    <a href="/">{ru ? 'На главную' : 'Home'}</a></div>
  </section></main>;
}

export function isChunkLoadError(error: Error) {
  return error.name === 'ChunkLoadError' || /Loading (?:CSS )?chunk .+ failed|Failed to fetch dynamically imported module/i.test(error.message);
}
