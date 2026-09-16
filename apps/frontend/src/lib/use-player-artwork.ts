'use client';
import { useEffect, useState } from 'react';
import type { PlayerTrack } from '../providers/player-provider';
import { getRelease } from './api';

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
