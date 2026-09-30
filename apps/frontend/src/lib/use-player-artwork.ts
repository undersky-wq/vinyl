'use client';
import { useEffect, useState } from 'react';
import type { PlayerTrack } from '../providers/player-provider';
import { getRelease } from './api';
import { getBackCoverUrl } from './release-images';

export function usePlayerArtwork(track: PlayerTrack | null, enabled: boolean) {
  const [artwork,setArtwork] = useState<{id:string;url:string}|null>(null);
  useEffect(() => {
    if (!enabled || !track?.releaseId || track.coverFullUrl) return;
    let cancelled=false;
    const id=track.releaseId;
    void getRelease(id).then(release=>{
      const url=release.coverStorageUrl || release.coverImageUrl || release.coverMediumStorageUrl;
      if(!cancelled && url)setArtwork({id,url});
    }).catch(()=>{});
    return () => {cancelled=true;};
  }, [enabled,track?.releaseId,track?.coverFullUrl]);
  return track?.coverFullUrl || (artwork?.id===track?.releaseId ? artwork?.url : '') || track?.coverUrl;
}

export function usePlayerBackArtwork(track: PlayerTrack | null, enabled: boolean) {
  const [artwork,setArtwork] = useState<{id:string;url:string}|null>(null);
  useEffect(() => {
    if (!enabled || !track?.releaseId) return;
    let cancelled=false;
    const id=track.releaseId;
    void getRelease(id).then(release=>{
      if(!cancelled)setArtwork({id,url:getBackCoverUrl(release)});
    }).catch(()=>{if(!cancelled)setArtwork({id,url:''});});
    return () => {cancelled=true;};
  }, [enabled,track?.releaseId]);
  return artwork && artwork.id===track?.releaseId ? artwork.url : '';
}
