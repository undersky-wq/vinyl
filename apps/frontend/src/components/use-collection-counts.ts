'use client';
import { useEffect, useState } from 'react';
import { getLibraryReleasesFeed, getPlaylistCount } from '../lib/api';
import { useAuth } from '../providers/auth-provider';
import { useFavorites } from '../providers/favorites-provider';

export function useCollectionCounts() {
  const {user} = useAuth();
  const {favoriteTrackIds} = useFavorites();
  const userId = user?.id || null;
  const [playlistCount,setPlaylistCount] = useState<{userId: string | null; value: number | null}>({userId:null,value:0});
  const [mixes,setMixes] = useState<number | null>(null);
  const [originals,setOriginals] = useState<number | null>(null);
  const [releases,setReleases] = useState<number | null>(null);
  useEffect(() => {
    if (!userId) {setPlaylistCount({userId:null,value:0});return;}
    let cancelled = false;
    let request = 0;
    const refresh = () => {
      const version = ++request;
      void getPlaylistCount().then(value => {
        if (!cancelled && version === request) setPlaylistCount({userId,value});
      }).catch(() => {
        // A failed refresh must not erase an already known count.
      });
    };
    refresh();
    window.addEventListener('vinyl:playlists-changed',refresh);
    return () => {cancelled=true;window.removeEventListener('vinyl:playlists-changed',refresh);};
  },[userId]);
  useEffect(() => {
    let cancelled=false;
    setMixes(null);
    setOriginals(null);
    setReleases(null);
    Promise.allSettled([
      getLibraryReleasesFeed(new URLSearchParams({isMix:'true',limit:'1',offset:'0'})),
      getLibraryReleasesFeed(new URLSearchParams({isMix:'false',limit:'1',offset:'0'})),
      getLibraryReleasesFeed(new URLSearchParams({isOriginal:'true',limit:'1',offset:'0'})),
    ]).then(([mixFeed, releaseFeed, originalsFeed]) => {
      if (cancelled) return;
      setMixes(mixFeed.status === 'fulfilled' ? (mixFeed.value.collectionTotal ?? mixFeed.value.total) : null);
      setReleases(releaseFeed.status === 'fulfilled' ? (releaseFeed.value.collectionTotal ?? releaseFeed.value.total) : null);
      setOriginals(originalsFeed.status === 'fulfilled' ? (originalsFeed.value.collectionTotal ?? originalsFeed.value.total) : null);
    });
    return () => {cancelled=true;};
  },[user?.id]);
  const count = userId ? (playlistCount.userId === userId ? playlistCount.value : null) : 0;
  return {releases:releases ?? '—',playlists:count ?? '—',mixes:mixes ?? '—',originals:originals ?? '—',favorites:favoriteTrackIds.length};
}
