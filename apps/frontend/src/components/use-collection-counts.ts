'use client';
import { useEffect, useState } from 'react';
import { getLibraryReleasesFeed } from '../lib/api';
import { useAuth } from '../providers/auth-provider';
import { useFavorites } from '../providers/favorites-provider';
import { usePlaylists } from '../providers/playlists-provider';

export function useCollectionCounts() {
  const {user} = useAuth();
  const {playlists,isLoading} = usePlaylists();
  const {favoriteTrackIds} = useFavorites();
  const [mixes,setMixes] = useState<number | null>(null);
  useEffect(() => {
    let cancelled=false;
    setMixes(null);
    getLibraryReleasesFeed(new URLSearchParams({isMix:'true',limit:'1',offset:'0'}))
      .then(feed => {if(!cancelled)setMixes(feed.total);})
      .catch(() => {if(!cancelled)setMixes(null);});
    return () => {cancelled=true;};
  },[user?.id]);
  return {playlists:isLoading?'…':playlists.length,mixes:mixes ?? '—',favorites:favoriteTrackIds.length};
}
