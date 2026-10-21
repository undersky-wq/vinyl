'use client';

import { CSSProperties, FormEvent, ReactNode, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pause, Play, Trash2, LoaderCircle } from 'lucide-react';
import {
  createReleaseTimelineComment,
  deleteReleaseTimelineComment,
  getReleaseTimelineComments,
} from '../lib/api';
import { SiteLang } from '../lib/language';
import { formatSecondsAsClock, normalizeDurationLabel } from '../lib/time';
import { buildFallbackWaveform, useResponsiveWaveform } from '../lib/waveform';
import { useAuth } from '../providers/auth-provider';
import { usePlayerActions, usePlayerTransport } from '../providers/player-provider';
import { HomeRelease, TimelineComment } from '../types';
import { TimelineCommentMarkers } from './timeline-comment-markers';
import { CopyMusicLink } from './copy-music-link';
import { TimelineCommentComposer } from './timeline-comment-composer';
import { TimelineCommentRow } from './timeline-comment-row';
import { musicPageQueue } from '../lib/music-page-queue';
import './music-mobile-layout.css';

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
  timelineControls = false,
  commentsAlwaysOpen = false,
  queueReleases,
  onCommentsOpenChange,
}: {
  release: HomeRelease;
  lang: SiteLang;
  actions: ReactNode;
  yearInHeading?: boolean;
  timelineControls?: boolean;
  commentsAlwaysOpen?: boolean;
  queueReleases?: HomeRelease[];
  onCommentsOpenChange?: (open: boolean, count: number) => void;
}) {
  const router = useRouter();
  const {user} = useAuth();
  const {currentTrack, isPlaying} = usePlayerTransport();
  const {getAudioElement, playQueue, playQueueAtPercent, seekToPercent, togglePlayback} = usePlayerActions();
  const track = release.tracks.find(item => item.audioUrl) || release.tracks[0];
  const queue = useMemo(() => musicPageQueue(queueReleases || [release]),[queueReleases,release]);
  const queueIndex = queue.findIndex(item => item.id === track?.id);
  const sourcePeaks = track?.waveformData?.length ? track.waveformData : buildFallbackWaveform(`${release.id}-${release.title}`);
  const {ref: waveformRef, peaks} = useResponsiveWaveform(sourcePeaks,{minBars:72,maxBars:190,pixelsPerBar:5});
  const [comments,setComments] = useState<TimelineComment[]>([]);
  const [commentsOpen,setCommentsOpen] = useState(false);
  const [commentText,setCommentText] = useState('');
  const [commentSecond,setCommentSecond] = useState<number | null>(null);
  const [savingComment,setSavingComment] = useState(false);
  const [deletingComment,setDeletingComment] = useState<string | null>(null);
  const [progress,setProgress] = useState(0);
  const [elapsed,setElapsed] = useState(0);
  const [audioDuration,setAudioDuration] = useState(0);
  const [status,setStatus] = useState('');
  const isCurrent = currentTrack?.releaseId === release.id;
  const rawParts = track?.durationRaw?.split(':').map(Number);
  const duration = track?.durationSec || (rawParts && rawParts.length >= 2 && rawParts.length <= 3 && rawParts.every(Number.isFinite) ? rawParts.reduce((total,part)=>total*60+part,0) : 0);
  const totalDuration = isCurrent && audioDuration > 0 ? audioDuration : duration;
  const visibleComments = commentsAlwaysOpen || commentsOpen;
  const selectedCommentSecond = commentSecond ?? (commentsAlwaysOpen ? Math.floor(elapsed) : null);

  useEffect(() => {
    let cancelled=false;
    getReleaseTimelineComments(release.id).then(value => {if(!cancelled)setComments(value);}).catch(()=>{if(!cancelled)setComments([]);});
    return () => {cancelled=true;};
  },[release.id]);

  useEffect(() => {
    const audio=getAudioElement();
    if(!isCurrent || !audio){setProgress(0);setElapsed(0);setAudioDuration(0);return;}
    const sync=()=>{
      const total=Number.isFinite(audio.duration) && audio.duration>0 ? audio.duration : duration;
      setProgress(total ? Math.max(0,Math.min(100,audio.currentTime/total*100)) : 0);
      setElapsed(Math.max(0,audio.currentTime));
      setAudioDuration(total);
    };
    sync();
    audio.addEventListener('timeupdate',sync);audio.addEventListener('loadedmetadata',sync);audio.addEventListener('seeked',sync);
    return()=>{audio.removeEventListener('timeupdate',sync);audio.removeEventListener('loadedmetadata',sync);audio.removeEventListener('seeked',sync);};
  },[duration,getAudioElement,isCurrent]);

  function seek(event: React.MouseEvent<HTMLButtonElement>) {
    if(queueIndex < 0)return;
    const rect=event.currentTarget.getBoundingClientRect();
    const percent=Math.max(0,Math.min(100,(event.clientX-rect.left)/rect.width*100));
    const second=Math.round((duration || track?.durationSec || 0)*percent/100);
    setCommentSecond(second);
    const audio=getAudioElement();
    if(isCurrent && audio && Number.isFinite(audio.duration) && audio.duration>0)seekToPercent(percent);
    else playQueueAtPercent(queue,queueIndex,percent);
  }

  async function addComment(event: FormEvent) {
    event.preventDefault();
    if(!user){router.push('/profile');return;}
    const text=commentText.trim();if(!text || selectedCommentSecond === null || savingComment || deletingComment)return;
    setSavingComment(true);setStatus('');
    try{
      const comment=await createReleaseTimelineComment(release.id,{second:selectedCommentSecond,text});
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
      <CopyMusicLink releaseId={release.id} lang={lang} />
    </div>
    {timelineControls ? <div className="paper-mix-heading">
      <button className="paper-mix-play" type="button" disabled={queueIndex < 0} aria-label={release.isOriginal ? (lang==='ru' ? isCurrent && isPlaying ? 'Пауза трека' : 'Воспроизвести трек' : isCurrent && isPlaying ? 'Pause track' : 'Play track') : (lang==='ru' ? isCurrent && isPlaying ? 'Пауза микса' : 'Воспроизвести микс' : isCurrent && isPlaying ? 'Pause mix' : 'Play mix')} onClick={()=>{if(isCurrent)togglePlayback();else playQueue(queue,queueIndex,queue);}}>
        {isCurrent && isPlaying ? <Pause size={24}/> : <Play size={24}/>}
      </button>
      <h2><span className="paper-mix-name"><span className="paper-mix-artist" title={release.artist}>{release.artist}</span><span className="paper-mix-title-separator"> : </span><span className="paper-release-title-regular paper-mix-title" title={release.title}>{release.title}</span></span>{release.year ? <time dateTime={String(release.year)}>{release.year}</time> : null}</h2>
    </div> : null}
    <div className={`paper-mix-timeline${timelineControls ? ' has-transport' : ''}`}>
      <div className="paper-mix-wave">
        <button ref={waveformRef} type="button" onClick={seek} aria-label={release.isOriginal ? (lang==='ru'?'Перемотать трек':'Seek track') : (lang==='ru'?'Перемотать микс':'Seek mix')}>
          {peaks.map((peak,index)=><span key={index} className={(index/Math.max(1,peaks.length-1))*100<=progress?'is-active':''} style={{height:`${Math.max(8,Math.round(peak*100))}%`} as CSSProperties}/>)}
        </button>
        <TimelineCommentMarkers comments={comments} durationSec={totalDuration} />
      </div>
      {timelineControls ? <div className="paper-mix-timecodes">
        <time aria-label={lang==='ru'?'Прошедшее время':'Elapsed time'}>{formatSecondsAsClock(elapsed)}</time>
        <time aria-label={lang==='ru'?'Полная длительность':'Total duration'}>{totalDuration > 0 ? formatSecondsAsClock(totalDuration) : '—'}</time>
      </div> : <div className="paper-mix-timeline-actions">{actions}<time>{normalizeDurationLabel(track.durationRaw,track.durationSec,'—')}</time></div>}
    </div>
    {!commentsAlwaysOpen ? <div className="paper-mix-footer"><button className="paper-mix-comments-toggle" type="button" aria-expanded={commentsOpen} onClick={()=>{const next=!commentsOpen;setCommentsOpen(next);onCommentsOpenChange?.(next,comments.length);}}>
      <span>{lang==='ru'?'Комментарии':'Comments'}</span><sup>{comments.length}</sup>
    </button></div> : null}
    <div className="paper-mix-comments" data-open={visibleComments} inert={!visibleComments}>
      <TimelineCommentComposer lang={lang} second={selectedCommentSecond} text={commentText} onTextChange={setCommentText} onSubmit={addComment} pending={savingComment} disabled={Boolean(deletingComment)} />
      <div>{comments.map(comment=><TimelineCommentRow key={comment.id} comment={comment} timestamp={clock(comment.second)} actions={user && (user.id===comment.userId || user.role==='ADMIN') ? <button type="button" className="paper-mix-comment-delete" aria-label={lang==='ru'?'Удалить комментарий':'Delete comment'} title={lang==='ru'?'Удалить комментарий':'Delete comment'} aria-busy={deletingComment===comment.id} disabled={Boolean(deletingComment) || savingComment} onClick={()=>void removeComment(comment)}>{deletingComment===comment.id?<LoaderCircle size={16} aria-hidden="true"/>:<Trash2 size={16} aria-hidden="true"/>}</button> : null} />)}</div>
    </div>
    {status?<p className="paper-mix-status" role="status">{status}</p>:null}
  </>;
}
