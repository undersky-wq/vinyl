'use client';

import { Share2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { SiteLang } from '../lib/language';
import './copy-music-link.css';

const paths = new Map<string, Promise<string>>();
function sharePath(id: string) {
  if (!paths.has(id)) paths.set(id, fetch(`/music-links?id=${encodeURIComponent(id)}`).then(async response => {
    if (!response.ok) throw new Error('Link unavailable');
    const result = await response.json();
    return typeof result.path === 'string' && /^\/(mixes|tracks|releases)\//.test(result.path) ? result.path : `/releases/${encodeURIComponent(id)}`;
  }).catch(() => { paths.delete(id); return `/releases/${encodeURIComponent(id)}`; }));
  return paths.get(id)!;
}

export function CopyMusicLink({ releaseId, lang, className = '' }: { releaseId: string; lang: SiteLang; className?: string }) {
  const [notice, setNotice] = useState<{ url: string; copied: boolean } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [path, setPath] = useState('');
  useEffect(() => {
    let cancelled = false;
    setPath('');
    void sharePath(releaseId).then(value => { if (!cancelled) setPath(value); });
    return () => { cancelled = true; };
  }, [releaseId]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  async function copy() {
    const url = new URL(path || `/releases/${encodeURIComponent(releaseId)}`, window.location.origin).href;
    let copied = false;
    try { await navigator.clipboard.writeText(url); copied = true; } catch { /* Keep a selectable link when clipboard access is denied. */ }
    setNotice({ url, copied });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setNotice(null), copied ? 3500 : 7000);
  }

  return <>
    <button type="button" disabled={!path} className={`music-copy-link ${className}`} aria-label={lang === 'ru' ? 'Поделиться — скопировать ссылку' : 'Share — copy link'} title={lang === 'ru' ? 'Скопировать ссылку' : 'Copy link'} onClick={event => { event.stopPropagation(); void copy(); }}>
      <Share2 size={18} />
    </button>
    {notice ? createPortal(<div className="music-link-notice" role="status" aria-live="polite">
      <strong>{notice.copied ? (lang === 'ru' ? 'Ссылка скопирована' : 'Link copied') : (lang === 'ru' ? 'Скопируйте ссылку вручную' : 'Copy the link manually')}</strong>
      <input aria-label={lang === 'ru' ? 'Ссылка на музыку' : 'Music link'} readOnly value={notice.url} onFocus={event => event.currentTarget.select()} />
    </div>, document.body) : null}
  </>;
}
