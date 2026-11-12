'use client';
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { getHomeReleaseDetails } from '../lib/api';
import { usePlayerActions, usePlayerTransport, type PlayerTrack } from '../providers/player-provider';
import { CoverImage } from './cover-image';
import { CoverRotation } from './cover-rotation';
import { getBackCoverUrl, getSecondFrontCoverUrl, isBackSidePosition, vinylDisc } from '../lib/release-images';
import { FavoriteButton, TrackPlaylistMenu } from './track-actions';
import { normalizeDurationLabel } from '../lib/time';
import { trackArtist } from '../lib/track-artist';
import type { HomeRelease } from '../types';
import type { SiteLang } from '../lib/language';
import './mini-release-preview.css';
import './record-archive.css';

export function MiniReleasePreview({track,lang,onClose}:{track:PlayerTrack;lang:SiteLang;onClose:()=>void}) {
  const [release,setRelease]=useState<HomeRelease|null>(null);
  const [error,setError]=useState(false);
  const [closing,setClosing]=useState(false);
  const onCloseRef=useRef(onClose);
  onCloseRef.current=onClose;
  const {queue,currentTrack,isPlaying}=usePlayerTransport();
  const {playQueue,togglePlayback}=usePlayerActions();
  const artworkTrack=currentTrack&&currentTrack.releaseId===track.releaseId?currentTrack:track;
  const disc=vinylDisc(artworkTrack.position);
  const front=(release?(disc===2?getSecondFrontCoverUrl(release):release.coverStorageUrl||release.coverImageUrl||release.coverMediumStorageUrl):'')||artworkTrack.frontCoverFullUrl||artworkTrack.coverUrl;
  const back=(release?getBackCoverUrl(release,disc):'')||artworkTrack.backCoverUrl;
  const flipped=Boolean(back)&&(artworkTrack.coverSide==='back'||isBackSidePosition(artworkTrack.position));
  const close=()=>setClosing(true);
  useLayoutEffect(()=>{
    const cards=Array.from(document.querySelectorAll<HTMLElement>('.paper-archive:not(.mini-release-preview) .paper-record,.paper-archive:not(.mini-release-preview) .paper-list-tracks'));
    const width=document.documentElement.clientWidth;
    cards.forEach(card=>{
      const rect=card.getBoundingClientRect();
      const offset=rect.left+rect.width/2<width/2 ? -rect.right-64 : width-rect.left+64;
      card.style.setProperty('--mini-release-exit-x',`${offset}px`);
    });
    return()=>cards.forEach(card=>card.style.removeProperty('--mini-release-exit-x'));
  },[]);
  useEffect(()=>{
    document.body.classList.toggle('is-mini-release-expanded',!closing);
    return()=>document.body.classList.remove('is-mini-release-expanded');
  },[closing]);
  useEffect(()=>{if(!closing)return;const timer=setTimeout(()=>onCloseRef.current(),550);return()=>clearTimeout(timer);},[closing]);
  useEffect(()=>{let cancelled=false;if(track.releaseId)void getHomeReleaseDetails(track.releaseId).then(value=>{if(!cancelled)setRelease(value);}).catch(()=>{if(!cancelled)setError(true);});return()=>{cancelled=true;};},[track.releaseId]);
  useEffect(()=>{const key=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.stopPropagation();setClosing(true);}};window.addEventListener('keydown',key,true);return()=>window.removeEventListener('keydown',key,true);},[]);
  return <div className={`mini-release-preview paper-archive is-open is-expanded${closing?' is-closing':''}`} onAnimationEnd={event=>{if(closing&&event.target===event.currentTarget)onCloseRef.current();}} onClick={event=>{event.stopPropagation();if(event.target===event.currentTarget)close();}}>
    <button type="button" className="mini-release-preview__dismiss" tabIndex={-1} onClick={close} aria-label={lang==='ru'?'Закрыть релиз':'Close release'}/>
    <section role="dialog" aria-label={lang==='ru'?'Играющий релиз':'Playing release'} className="mini-release-preview__panel">
      <button type="button" className={`paper-record is-selected${flipped?' is-flipped':''}`} autoFocus onClick={close} aria-label={lang==='ru'?'Закрыть релиз':'Close release'}><CoverRotation key={`${track.releaseId}:${disc}`}><span className="paper-record-face paper-record-front"><CoverImage src={front} alt={release?.title || track.title} width={900} height={900}/></span><span className={`paper-record-face paper-record-back${back?'':' cover-rotation-placeholder'}`}>{back?<CoverImage src={back} alt={release?.title || track.title} width={900} height={900}/>:null}</span></CoverRotation></button>
      <aside className="paper-tracklist"><h2 className="paper-release-heading"><span>{release?.artist || track.artist}</span></h2><p>{release?.title || track.title}<span>{release?.year || ''}</span></p>
        {!release&&<p role="status">{error?(lang==='ru'?'Не удалось загрузить релиз':'Could not load release'):(lang==='ru'?'Загрузка треков…':'Loading tracks…')}</p>}
        <ol>{release?.tracks.map((item,index)=><li className={`paper-track-line${item.id===currentTrack?.id?' is-playing':''}`} style={{'--line-delay':`${.48+Math.min(index,12)*.065}s`} as CSSProperties} key={item.id}><button type="button" className="paper-track-play" disabled={!item.audioUrl} aria-pressed={item.id===currentTrack?.id&&isPlaying} onClick={event=>{
          event.stopPropagation();if(item.id===currentTrack?.id){togglePlayback();return;}
          const index=queue.findIndex(candidate=>candidate.id===item.id);
          if(index>=0){playQueue(queue,index);return;}
          const tracks=release.tracks.filter(candidate=>candidate.audioUrl).map(candidate=>({...candidate,artist:trackArtist(candidate,release.artist),coverUrl:release.coverMediumStorageUrl || track.coverUrl,releaseId:release.id,isPublic:release.isMix,isOriginal:release.isOriginal,playbackSource:track.playbackSource}));
          playQueue(tracks.map(candidate=>({...candidate,waveformData:candidate.waveformData || []})),tracks.findIndex(candidate=>candidate.id===item.id));
        }}><small>{item.position || '—'}</small><span>{item.title}</span></button><span className="paper-track-actions"><FavoriteButton trackId={item.id} lang={lang}/><TrackPlaylistMenu trackId={item.id} lang={lang}/></span><time>{normalizeDurationLabel(item.durationRaw,item.durationSec,'—')}</time></li>)}</ol>
        <p className="paper-release-styles">{release?.styles.join(' · ')}</p>
      </aside>
    </section>
  </div>;
}
