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
  const [releases,setReleases] = useState<number | null>(null);
  useEffect(() => {
    let cancelled=false;
    setMixes(null);
    setReleases(null);
    Promise.allSettled([
      getLibraryReleasesFeed(new URLSearchParams({isMix:'true',limit:'1',offset:'0'})),
      getLibraryReleasesFeed(new URLSearchParams({isMix:'false',limit:'1',offset:'0'})),
    ]).then(([mixFeed, releaseFeed]) => {
      if (cancelled) return;
      setMixes(mixFeed.status === 'fulfilled' ? (mixFeed.value.collectionTotal ?? mixFeed.value.total) : null);
      setReleases(releaseFeed.status === 'fulfilled' ? (releaseFeed.value.collectionTotal ?? releaseFeed.value.total) : null);
    });
    return () => {cancelled=true;};
  },[user?.id]);
  return {releases:releases ?? '—',playlists:isLoading?'…':playlists.length,mixes:mixes ?? '—',favorites:favoriteTrackIds.length};
}
