'use client';

import { CSSProperties, FormEvent, ReactNode, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  createReleaseTimelineComment,
  deleteReleaseTimelineComment,
  getReleaseTimelineComments,
} from '../lib/api';
import { SiteLang } from '../lib/language';
import { normalizeDurationLabel } from '../lib/time';
import { buildFallbackWaveform, useResponsiveWaveform } from '../lib/waveform';
import { useAuth } from '../providers/auth-provider';
import { usePlayerActions, usePlayerTransport } from '../providers/player-provider';
import { HomeRelease, TimelineComment } from '../types';
import { TimelineCommentMarkers } from './timeline-comment-markers';

function clock(seconds: number) {
  const value = Math.max(0, Math.floor(seconds));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2,'0')}`;
}

function avatarInitial(name?: string | null) {
  return (name || 'U').trim().slice(0,1).toUpperCase() || 'U';
}

export function ShelfMixTrack({
  release,
  lang,
  actions,
  yearInHeading = false,
  onCommentsOpenChange,
}: {
  release: HomeRelease;
  lang: SiteLang;
  actions: ReactNode;
  yearInHeading?: boolean;
  onCommentsOpenChange?: (open: boolean, count: number) => void;
}) {
  const router = useRouter();
  const {user} = useAuth();
  const {currentTrack} = usePlayerTransport();
  const {getAudioElement, playQueueAtPercent, seekToPercent} = usePlayerActions();
  const track = release.tracks.find(item => item.audioUrl) || release.tracks[0];
  const queue = useMemo(() => track?.audioUrl ? [{
    ...track,
    waveformData: track.waveformData || [],
    artist: release.artist,
    coverUrl: release.coverMediumStorageUrl || release.coverThumbStorageUrl || release.coverStorageUrl || release.coverImageUrl || '/icon.png',
    coverFullUrl: release.coverStorageUrl || release.coverImageUrl || release.coverMediumStorageUrl || '/icon.png',
    releaseId: release.id,
    isPublic: Boolean(release.isMix),
  }] : [],[release,track]);
  const sourcePeaks = track?.waveformData?.length ? track.waveformData : buildFallbackWaveform(`${release.id}-${release.title}`);
  const {ref: waveformRef, peaks} = useResponsiveWaveform(sourcePeaks,{minBars:72,maxBars:190,pixelsPerBar:5});
  const [comments,setComments] = useState<TimelineComment[]>([]);
  const [commentsOpen,setCommentsOpen] = useState(false);
  const [commentText,setCommentText] = useState('');
  const [commentSecond,setCommentSecond] = useState<number | null>(null);
  const [savingComment,setSavingComment] = useState(false);
  const [deletingComment,setDeletingComment] = useState<string | null>(null);
  const [progress,setProgress] = useState(0);
  const [status,setStatus] = useState('');
  const isCurrent = currentTrack?.releaseId === release.id;
  const duration = track?.durationSec || 0;

  useEffect(() => {
    let cancelled=false;
    getReleaseTimelineComments(release.id).then(value => {if(!cancelled)setComments(value);}).catch(()=>{if(!cancelled)setComments([]);});
    return () => {cancelled=true;};
  },[release.id]);

  useEffect(() => {
    const audio=getAudioElement();
    if(!isCurrent || !audio){setProgress(0);return;}
    const sync=()=>{
      const total=Number.isFinite(audio.duration) && audio.duration>0 ? audio.duration : duration;
      setProgress(total ? Math.max(0,Math.min(100,audio.currentTime/total*100)) : 0);
    };
    sync();
    audio.addEventListener('timeupdate',sync);audio.addEventListener('loadedmetadata',sync);audio.addEventListener('seeked',sync);
    return()=>{audio.removeEventListener('timeupdate',sync);audio.removeEventListener('loadedmetadata',sync);audio.removeEventListener('seeked',sync);};
  },[duration,getAudioElement,isCurrent]);

  function seek(event: React.MouseEvent<HTMLButtonElement>) {
    if(!queue.length)return;
    const rect=event.currentTarget.getBoundingClientRect();
    const percent=Math.max(0,Math.min(100,(event.clientX-rect.left)/rect.width*100));
    const second=Math.round((duration || track?.durationSec || 0)*percent/100);
    setCommentSecond(second);
    const audio=getAudioElement();
    if(isCurrent && audio && Number.isFinite(audio.duration) && audio.duration>0)seekToPercent(percent);
    else playQueueAtPercent(queue,0,percent);
  }

  async function addComment(event: FormEvent) {
    event.preventDefault();
    if(!user){router.push('/profile');return;}
    const text=commentText.trim();if(!text || commentSecond === null || savingComment || deletingComment)return;
    setSavingComment(true);setStatus('');
    try{
      const comment=await createReleaseTimelineComment(release.id,{second:commentSecond,text});
      setComments(current=>[...current,comment].sort((a,b)=>a.second-b.second));setCommentText('');
    }catch{setStatus(lang==='ru'?'Комментарий не сохранён.':'Comment was not saved.');}
    finally{setSavingComment(false);}
  }

  async function removeComment(comment: TimelineComment) {
    if (!user || (user.id !== comment.userId && user.role !== 'ADMIN') || deletingComment) return;
    setDeletingComment(comment.id);setStatus('');
    try {
      await deleteReleaseTimelineComment(release.id,comment.id);
      const next=comments.filter(item=>item.id!==comment.id);
      setComments(next);
      onCommentsOpenChange?.(commentsOpen,next.length);
    } catch {setStatus(lang==='ru'?'Комментарий не удалён.':'Comment was not deleted.');}
    finally {setDeletingComment(null);}
  }

  if(!track)return null;
  return <>
    <div className="paper-mix-meta">
      <span>{release.styles.join(' · ') || (lang==='ru'?'Стиль не указан':'Style unavailable')}</span>
      {!yearInHeading && release.year ? <time>{release.year}</time> : null}
    </div>
    <div className="paper-mix-timeline">
      <div className="paper-mix-wave">
        <button ref={waveformRef} type="button" onClick={seek} aria-label={lang==='ru'?'Перемотать микс':'Seek mix'}>
          {peaks.map((peak,index)=><span key={index} className={(index/Math.max(1,peaks.length-1))*100<=progress?'is-active':''} style={{height:`${Math.max(8,Math.round(peak*100))}%`} as CSSProperties}/>)}
        </button>
        <TimelineCommentMarkers comments={comments} durationSec={duration} />
      </div>
      <div className="paper-mix-timeline-actions">{actions}<time>{normalizeDurationLabel(track.durationRaw,track.durationSec,'—')}</time></div>
    </div>
    <button className="paper-mix-comments-toggle" type="button" aria-expanded={commentsOpen} onClick={()=>{setCommentsOpen(value=>{const next=!value;onCommentsOpenChange?.(next,comments.length);return next;});}}>
      {lang==='ru'?'Комментарии':'Comments'} <sup>{comments.length}</sup>
    </button>
    <div className="paper-mix-comments" data-open={commentsOpen} inert={!commentsOpen}>
      <form onSubmit={addComment}>
        <span className="paper-mix-comment-avatar">{user?.avatarStorageUrl?<img src={user.avatarStorageUrl} alt=""/>:avatarInitial(user?.displayName)}</span>
        <time aria-label={lang==='ru'?'Время комментария в миксе':'Comment time in mix'}>{commentSecond===null?'--:--':clock(commentSecond)}</time>
        <input value={commentText} onChange={event=>setCommentText(event.target.value)} maxLength={280} placeholder={lang==='ru'?'Комментарий на таймлайне…':'Comment on the timeline…'}/>
        <button type="submit" disabled={savingComment||Boolean(deletingComment)||commentSecond===null||!commentText.trim()}>{savingComment?'…':'Post'}</button>
      </form>
      <div>{comments.map(comment=><article key={comment.id}><span className="paper-mix-comment-avatar">{comment.user.avatarStorageUrl?<img src={comment.user.avatarStorageUrl} alt=""/>:avatarInitial(comment.user.displayName)}</span><strong>{comment.user.displayName}</strong><time>{clock(comment.second)}</time>{user && (user.id===comment.userId || user.role==='ADMIN') ? <button type="button" className="paper-mix-comment-delete" disabled={Boolean(deletingComment) || savingComment} onClick={()=>void removeComment(comment)}>{deletingComment===comment.id?'…':lang==='ru'?'Удалить':'Delete'}</button> : null}<p>{comment.text}</p></article>)}</div>
    </div>
    {status?<p className="paper-mix-status" role="status">{status}</p>:null}
  </>;
}
