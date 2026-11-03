'use client';
import { useEffect, useState } from 'react';
import type { PlayerTrack } from '../providers/player-provider';
import { getRelease } from './api';
import { getBackCoverUrl, getSecondFrontCoverUrl, isBackSidePosition, vinylDisc } from './release-images';

export function usePlayerCoverSide(track: PlayerTrack | null, backArtwork: string | undefined) {
  const [manual,setManual] = useState<{key:string;back:boolean}|null>(null);
  const key = `${track?.id || ''}:${track?.position || ''}`;
  const isCoverFlipped = Boolean(backArtwork) && (manual?.key === key ? manual.back : track?.coverSide === 'back' || isBackSidePosition(track?.position));
  return { isCoverFlipped, toggleCoverSide: () => setManual({key,back:!isCoverFlipped}) };
}

export function usePlayerArtwork(track: PlayerTrack | null, enabled: boolean) {
  const disc = vinylDisc(track?.position);
  const [artwork,setArtwork] = useState<{id:string;url:string}|null>(null);
  useEffect(() => {
    if (!enabled || !track?.releaseId || track.frontCoverFullUrl || (track.coverFullUrl && track.coverSide !== 'back')) return;
    let cancelled=false;
    const id=track.releaseId;
    void getRelease(id).then(release=>{
      const url=(disc === 2 ? getSecondFrontCoverUrl(release) : '') || release.coverStorageUrl || release.coverImageUrl || release.coverMediumStorageUrl;
      if(!cancelled && url)setArtwork({id:`${id}:${disc}`,url});
    }).catch(()=>{});
    return () => {cancelled=true;};
  }, [enabled,track?.releaseId,track?.coverFullUrl,track?.coverSide,track?.frontCoverFullUrl,disc]);
  return track?.frontCoverFullUrl || (track?.coverSide !== 'back' ? track?.coverFullUrl : '') || (artwork?.id===`${track?.releaseId}:${disc}` ? artwork?.url : '') || track?.frontCoverUrl || track?.coverUrl;
}

export function usePlayerBackArtwork(track: PlayerTrack | null, enabled: boolean) {
  const disc = vinylDisc(track?.position);
  const [artwork,setArtwork] = useState<{id:string;url:string}|null>(null);
  useEffect(() => {
    if (!enabled || !track?.releaseId) return;
    let cancelled=false;
    const id=track.releaseId;
    void getRelease(id).then(release=>{
      if(!cancelled)setArtwork({id:`${id}:${disc}`,url:getBackCoverUrl(release,disc)});
    }).catch(()=>{if(!cancelled)setArtwork({id:`${id}:${disc}`,url:''});});
    return () => {cancelled=true;};
  }, [enabled,track?.releaseId,disc]);
  return track?.backCoverUrl || (artwork && artwork.id===`${track?.releaseId}:${disc}` ? artwork.url : '');
}
