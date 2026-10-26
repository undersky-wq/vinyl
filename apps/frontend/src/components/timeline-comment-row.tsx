'use client';

import { ReactNode, useEffect, useState } from 'react';
import { Heart } from 'lucide-react';
import { TimelineComment } from '../types';
import { setTimelineCommentLike } from '../lib/api';
import { useAuth } from '../providers/auth-provider';
import './timeline-comment-row.css';

export function TimelineCommentRow({ comment, timestamp, onSeek, actions }: {
  comment: TimelineComment;
  timestamp: string;
  onSeek?: () => void;
  actions?: ReactNode;
}) {
  const { requireAuth, user } = useAuth();
  const [likes, setLikes] = useState({likeCount: comment.likeCount || 0, likedByMe: Boolean(comment.likedByMe)});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    setLikes({likeCount: comment.likeCount || 0, likedByMe: Boolean(user && comment.likedByMe)});
  }, [comment.id, comment.likeCount, comment.likedByMe, user?.id]);
  useEffect(() => {
    const update = (event: Event) => {
      const detail = (event as CustomEvent<{id:string; likeCount:number; likedByMe:boolean}>).detail;
      if (detail.id === comment.id) setLikes(detail);
    };
    window.addEventListener('vinyl:comment-like', update);
    return () => window.removeEventListener('vinyl:comment-like', update);
  }, [comment.id]);
  async function toggleLike() {
    if (pending || !requireAuth()) return;
    setPending(true);setError(false);
    try {
      const result = await setTimelineCommentLike(comment.releaseId, comment.id, !likes.likedByMe);
      setLikes(result);
      window.dispatchEvent(new CustomEvent('vinyl:comment-like', {detail:{id:comment.id,...result}}));
    } catch { setError(true); }
    finally { setPending(false); }
  }
  return <article className="timeline-comment-row">
    <span className="timeline-comment-row__avatar" role={onSeek ? 'button' : undefined} tabIndex={onSeek ? 0 : undefined} onClick={onSeek} onKeyDown={event=>{if(onSeek && (event.key==='Enter'||event.key===' ')){event.preventDefault();onSeek();}}}>{comment.user.avatarStorageUrl ? <img src={comment.user.avatarStorageUrl} alt="" /> : (comment.user.displayName || 'U').trim().charAt(0).toUpperCase()}</span>
    {onSeek ? <button className="timeline-comment-row__time" type="button" onClick={onSeek}>{timestamp}</button> : <time className="timeline-comment-row__time">{timestamp}</time>}
    <p className="timeline-comment-row__text" role={onSeek ? 'button' : undefined} tabIndex={onSeek ? 0 : undefined} onClick={onSeek} onKeyDown={event=>{if(onSeek && (event.key==='Enter'||event.key===' ')){event.preventDefault();onSeek();}}}><strong>{comment.user.displayName}</strong>: {comment.text}</p>
    <span className="timeline-comment-row__actions">
      <button type="button" className="timeline-comment-row__like" aria-label={likes.likedByMe ? 'Убрать лайк' : 'Нравится'} aria-pressed={likes.likedByMe} aria-busy={pending} disabled={pending} onClick={() => void toggleLike()}>
        <Heart size={16} aria-hidden="true" fill={likes.likedByMe ? 'currentColor' : 'none'} />{likes.likeCount > 0 ? <span>{likes.likeCount}</span> : null}
      </button>
      {actions}
    </span>
    {error && <span className="timeline-comment-row__error" role="status">Не удалось обновить лайк. Попробуйте ещё раз.</span>}
  </article>;
}
