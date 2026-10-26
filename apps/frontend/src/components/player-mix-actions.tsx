'use client';

import { Download, MessageCircle } from 'lucide-react';
import { FavoriteButton } from './track-actions';
import { useFavorites } from '../providers/favorites-provider';
import { getMusicEngagement, type MusicEngagement } from '../lib/music-engagement';
import './player-mix-counters.css';
import { CopyMusicLink } from './copy-music-link';
import { TimelineCommentComposer } from './timeline-comment-composer';
import { TimelineCommentRow } from './timeline-comment-row';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createReleaseTimelineComment, getRelease } from '../lib/api';
import { SiteLang } from '../lib/language';
import { useAuth } from '../providers/auth-provider';
import { PlayerTrack } from '../providers/player-provider';
import { usePlayerActions, usePlayerTransport } from '../providers/player-provider';
import { TimelineComment } from '../types';

const time = (second: number) => `${Math.floor(second / 60)}:${String(Math.floor(second % 60)).padStart(2, '0')}`;

export function PlayerMixActions({ track, lang, currentTime, duration, comments, onComment, seek, children }: {
  track: PlayerTrack; lang: SiteLang; currentTime: number; duration: number;
  comments: TimelineComment[]; onComment: (comment: TimelineComment) => void; seek: (percent: number) => void;
  children?: ReactNode;
}) {
  const { requireAuth } = useAuth();
  const { togglePlayback } = usePlayerActions();
  const { isPlaying } = usePlayerTransport();
  const { favoriteTrackIds } = useFavorites();
  const [engagement, setEngagement] = useState<MusicEngagement | null>(null);
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
      if (!cancelled) setIsMix(Boolean(release.isMix || release.isOriginal));
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [track.releaseId, track.isPublic, track.isOriginal]);
  useEffect(() => {
    let cancelled = false;
    setEngagement(null);
    if (!isMix || !track.releaseId) return;
    const id = track.releaseId;
    const refresh = () => { void getMusicEngagement(id).then(value => { if (!cancelled) setEngagement(value); }).catch(() => undefined); };
    refresh();
    window.addEventListener('music-engagement', refresh);
    window.addEventListener('focus', refresh);
    return () => { cancelled = true; window.removeEventListener('music-engagement', refresh); window.removeEventListener('focus', refresh); };
  }, [isMix, track.releaseId, favoriteTrackIds]);
  return <div className="player-page__mix-actions">
    <div className="player-page__secondary-actions">
      {isMix ? <button type="button" className="player-page__comments-toggle player-page__comments-icon" aria-label={lang === 'ru' ? 'Комментарии' : 'Comments'} title={lang === 'ru' ? 'Комментарии' : 'Comments'} aria-expanded={open} onClick={() => setOpen(!open)}><MessageCircle size={18}/>{comments.length > 0 ? <sup>{comments.length}</sup> : null}</button> : null}
      <FavoriteButton trackId={track.id} lang={lang} alwaysVisible count={isMix ? engagement?.favorites : undefined}/>
      {children}
      {isMix ? <>
      <a className="player-page__download" href={track.audioUrl} download aria-label={track.isOriginal ? (lang === 'ru' ? 'Скачать трек' : 'Download track') : (lang === 'ru' ? 'Скачать микс' : 'Download mix')}><Download size={18} /></a>
      {track.releaseId ? <CopyMusicLink releaseId={track.releaseId} lang={lang} copyCount={engagement?.copies ?? 0} /> : null}
      </> : null}
    </div>
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
      {comments.map((comment) => <TimelineCommentRow key={comment.id} comment={comment} timestamp={time(comment.second)} onSeek={() => {if(duration<=0)return;seek(comment.second / duration * 100);if(!isPlaying)togglePlayback();}} />)}
    </div> : null}
  </div>;
}
