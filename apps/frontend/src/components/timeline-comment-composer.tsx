'use client';

import type { FormEvent } from 'react';
import { Send, LoaderCircle } from 'lucide-react';
import type { SiteLang } from '../lib/language';
import { useAuth } from '../providers/auth-provider';
import './timeline-comment-composer.css';

export function TimelineCommentComposer({ lang, second, text, onTextChange, onSubmit, pending, disabled = false }: {
  lang: SiteLang;
  second: number | null;
  text: string;
  onTextChange: (text: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  pending: boolean;
  disabled?: boolean;
}) {
  const { user } = useAuth();
  const value = Math.max(0, Math.floor(second ?? 0));
  const placeholder = lang === 'ru' ? 'Комментарий на таймлайне…' : 'Comment on the timeline…';
  return <form className="timeline-comment-composer" onSubmit={onSubmit}>
    <span className="timeline-comment-composer__avatar">
      {user?.avatarStorageUrl ? <img src={user.avatarStorageUrl} alt="" /> : (user?.displayName || 'U').trim().slice(0, 1).toUpperCase() || 'U'}
    </span>
    <time aria-label={lang === 'ru' ? 'Время комментария' : 'Comment time'}>{second === null ? '--:--' : `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`}</time>
    <input aria-label={placeholder} value={text} onChange={event => onTextChange(event.target.value)} maxLength={280} placeholder={placeholder} />
    <button type="submit" aria-label={lang === 'ru' ? 'Отправить комментарий' : 'Post comment'} title={lang === 'ru' ? 'Отправить комментарий' : 'Post comment'} aria-busy={pending} disabled={pending || disabled || second === null || !text.trim()}>{pending ? <LoaderCircle size={16} aria-hidden="true" /> : <Send size={16} aria-hidden="true" />}</button>
  </form>;
}
