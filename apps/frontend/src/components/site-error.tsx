'use client';

import { useEffect, useState } from 'react';

export function SiteError({ reset, reload = false }: { reset: () => void; reload?: boolean }) {
  const [ru, setRu] = useState(true);
  useEffect(() => { setRu(document.documentElement.lang !== 'en'); }, []);
  return <main style={{ maxWidth: 560, margin: '15vh auto', padding: 24, fontFamily: 'Arial, Helvetica, sans-serif', lineHeight: 1.5 }}>
    <h1 style={{ fontSize: 24 }}>{ru ? 'Не удалось загрузить страницу' : 'Unable to load this page'}</h1>
    <p>{ru ? 'Проверьте соединение и попробуйте ещё раз.' : 'Check your connection and try again.'}</p>
    <button type="button" onClick={() => reload ? window.location.reload() : reset()} style={{ padding: '10px 16px', font: 'inherit', color: 'inherit', background: 'transparent', border: '1px solid currentColor', cursor: 'pointer' }}>
      {ru ? 'Попробовать снова' : 'Try again'}
    </button>
    <a href="/" style={{ marginLeft: 20, color: 'inherit' }}>{ru ? 'На главную' : 'Home'}</a>
  </main>;
}

export function isChunkLoadError(error: Error) {
  return error.name === 'ChunkLoadError' || /Loading (?:CSS )?chunk .+ failed|Failed to fetch dynamically imported module/i.test(error.message);
}
