'use client';

import { useEffect, useRef, useState } from 'react';
import { Download } from 'lucide-react';
import { useAuth } from '../providers/auth-provider';
import type { SiteLang } from '../lib/language';
import './download-music.css';

export function DownloadMusic({ releaseId, trackId, count = 0, lang }: { releaseId: string; trackId: string; count?: number; lang: SiteLang }) {
  const { user } = useAuth();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; if (timer.current) clearTimeout(timer.current); }; }, []);
  if (!user) return null;
  const label = lang === 'ru' ? 'Скачать' : 'Download';
  async function download() {
    if (pending) return;
    setPending(true); setFailed(false);
    const url = `/api/releases/${encodeURIComponent(releaseId)}/tracks/${encodeURIComponent(trackId)}/download`;
    try {
      // Check authorization without buffering a potentially large audio file.
      const response = await fetch(url, { method: 'HEAD', credentials: 'include', cache: 'no-store' });
      if (!response.ok) throw new Error('Download unavailable');
      const link = document.createElement('a');
      link.href = url; link.download = ''; document.body.appendChild(link); link.click(); link.remove();
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => window.dispatchEvent(new CustomEvent('music-engagement', { detail: releaseId })), 1500);
    } catch { if (mounted.current) setFailed(true); }
    finally { if (mounted.current) setPending(false); }
  }
  return <button type="button" className="music-download music-copy-link music-icon-tooltip" aria-label={label} data-tooltip={failed ? (lang === 'ru' ? 'Не удалось скачать. Проверьте вход и соединение' : 'Download failed. Check your login and connection') : label} disabled={pending} aria-busy={pending} onClick={event => { event.stopPropagation(); void download(); }}>
    <Download size={18} />{count > 0 ? <sup>{count}</sup> : null}
    {failed ? <span className="music-download-error" role="status">{lang === 'ru' ? 'Не удалось скачать' : 'Download failed'}</span> : null}
  </button>;
}
