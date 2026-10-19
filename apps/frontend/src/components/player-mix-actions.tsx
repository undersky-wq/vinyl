'use client';

import { Download } from 'lucide-react';
import { CopyMusicLink } from './copy-music-link';
import { TimelineCommentComposer } from './timeline-comment-composer';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createReleaseTimelineComment, getRelease } from '../lib/api';
import { SiteLang } from '../lib/language';
import { useAuth } from '../providers/auth-provider';
import { PlayerTrack } from '../providers/player-provider';
import { TimelineComment } from '../types';

const time = (second: number) => `${Math.floor(second / 60)}:${String(Math.floor(second % 60)).padStart(2, '0')}`;

export function PlayerMixActions({ track, lang, currentTime, duration, comments, onComment, seek, children }: {
  track: PlayerTrack; lang: SiteLang; currentTime: number; duration: number;
  comments: TimelineComment[]; onComment: (comment: TimelineComment) => void; seek: (percent: number) => void;
  children?: ReactNode;
}) {
  const { requireAuth } = useAuth();
  const [isMix, setIsMix] = useState(Boolean(track.isPublic || track.isOriginal));
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState('');
  const trackRef = useRef(track.id);
  trackRef.current = track.id;
  useEffect(() => {
    let cancelled = false;
    setIsMix(Boolean(track.isPublic || track.isOriginal)); setOpen(false); setText(''); setStatus('');
    if (track.releaseId) getRelease(track.releaseId).then((release) => {
      if (!cancelled) setIsMix(Boolean(release.isMix));
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [track.releaseId, track.isPublic, track.isOriginal]);
  return <div className="player-page__mix-actions">
    <div className="player-page__secondary-actions">
      {children}
      {isMix ? <>
      <a className="player-page__download" href={track.audioUrl} download aria-label={track.isOriginal ? (lang === 'ru' ? 'Скачать трек' : 'Download track') : (lang === 'ru' ? 'Скачать микс' : 'Download mix')}><Download size={18} /></a>
      {track.releaseId ? <CopyMusicLink releaseId={track.releaseId} lang={lang} /> : null}
      </> : null}
    </div>
    {isMix ? <button type="button" className="player-page__comments-toggle" aria-expanded={open} onClick={() => setOpen(!open)}><span>{lang === 'ru' ? 'Комментарии' : 'Comments'}</span><sup>{comments.length}</sup></button> : null}
    {status ? <p className="player-page__action-status" role="status">{status}</p> : null}
    {isMix && open ? <div className="player-page__comments">
      <TimelineCommentComposer lang={lang} second={currentTime} text={text} onTextChange={setText} pending={pending} onSubmit={async (event) => {
        event.preventDefault();
        if (!track.releaseId || pending || !text.trim() || !requireAuth()) return;
        setPending(true);
        try {
          const comment = await createReleaseTimelineComment(track.releaseId, { second: Math.floor(currentTime), text: text.trim() });
          if (trackRef.current === track.id) { onComment(comment); setText(''); }
        } catch { setStatus(lang === 'ru' ? 'Не удалось добавить комментарий' : 'Unable to add comment'); }
        finally { setPending(false); }
      }} />
      {comments.map((comment) => <div className="player-page__comment" key={comment.id}>
        <button type="button" onClick={() => seek(duration > 0 ? comment.second / duration * 100 : 0)}>{time(comment.second)}</button>
        <div><b>{comment.user.displayName}</b><p>{comment.text}</p></div>
      </div>)}
    </div> : null}
  </div>;
}
