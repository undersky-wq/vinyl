'use client';

import { AudioLines, Youtube } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { findTrackSources, importTrackSource, type TrackSourceMatch } from '../lib/api';
import type { SiteLang } from '../lib/language';

type Source = 'youtube' | 'bandcamp';
const labels = { youtube: 'YouTube', bandcamp: 'Bandcamp' };

export function TrackSourceImport({ trackId, lang, onImported }: {
  trackId: string;
  lang: SiteLang;
  onImported: () => Promise<void>;
}) {
  const router = useRouter();
  const ru = lang === 'ru';
  const headingId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const searchRequest = useRef<AbortController>(null);
  const [source, setSource] = useState<Source>('youtube');
  const [matches, setMatches] = useState<TrackSourceMatch[] | null>(null);
  const [error, setError] = useState('');
  const [importing, setImporting] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function search(provider: Source) {
    searchRequest.current?.abort();
    const request = new AbortController();
    searchRequest.current = request;
    setSource(provider);
    setMatches(null);
    setError('');
    dialog.current?.showModal();
    try {
      const found = await findTrackSources(trackId, provider, request.signal);
      if (!request.signal.aborted) setMatches(found);
    } catch (failure) {
      if (!request.signal.aborted) setError(failure instanceof Error ? failure.message : (ru ? 'Ошибка поиска.' : 'Search failed.'));
    }
  }

  async function add(matchId: string) {
    setError('');
    setImporting(matchId);
    try {
      await importTrackSource(trackId, matchId);
      setSaved(true);
      try {
        await onImported();
        dialog.current?.close();
      } catch {
        setError(ru ? 'MP3 сохранён. Обнови страницу, чтобы увидеть файл.' : 'MP3 saved. Refresh the page to see it.');
      }
      router.refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : (ru ? 'Ошибка загрузки.' : 'Import failed.'));
    } finally {
      setImporting(null);
    }
  }

  return <div className="track-source-import">
    {(['youtube', 'bandcamp'] as const).map(provider => {
      const label = ru ? `Найти аудио на ${labels[provider]}` : `Find audio on ${labels[provider]}`;
      const Icon = provider === 'youtube' ? Youtube : AudioLines;
      return <button key={provider} type="button" className="track-source-import__button"
        aria-label={label} title={label} disabled={saved || importing !== null}
        onClick={() => void search(provider)}>
        <Icon size={16} aria-hidden="true" /> {labels[provider]}
      </button>;
    })}
    <dialog ref={dialog} className="track-source-import__dialog" aria-labelledby={headingId}
      onClose={() => searchRequest.current?.abort()}
      onCancel={event => { if (importing) event.preventDefault(); }}>
      <h3 id={headingId}>{labels[source]}</h3>
      {error ? <p role="alert">{error}</p> : !matches ? (
        <p role="status">{ru ? 'Ищу по исполнителю и названию…' : 'Searching by artist and title…'}</p>
      ) : !matches.length ? (
        <p role="status">{ru ? 'Совпадений от 75% не найдено.' : 'No matches of 75% or higher.'}</p>
      ) : null}
      {matches && matches.length > 0 && <ul>
        {matches.map(match => <li key={match.id}>
          <div>
            <a href={match.url} target="_blank" rel="noopener noreferrer">{match.title}</a>
            <small>{match.score}% {ru ? 'по названию и исполнителю' : 'metadata match'}
              {match.duration ? ` · ${Math.floor(match.duration / 60)}:${String(Math.floor(match.duration % 60)).padStart(2, '0')}` : ''}
            </small>
          </div>
          <button type="button" disabled={saved || importing !== null} onClick={() => void add(match.id)}>
            {importing === match.id ? (ru ? 'Загружаю…' : 'Importing…') : (ru ? 'Скачать и добавить' : 'Download and add')}
          </button>
        </li>)}
      </ul>}
      <form method="dialog">
        <button disabled={importing !== null}>{ru ? 'Закрыть' : 'Close'}</button>
      </form>
    </dialog>
  </div>;
}
