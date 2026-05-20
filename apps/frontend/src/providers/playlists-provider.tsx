'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { addTrackToPlaylist, createPlaylist, getPlaylists, removeTrackFromPlaylist } from '../lib/api';
import { Playlist } from '../types';
import { useAuth } from './auth-provider';

type PlaylistsContextValue = {
  playlists: Playlist[];
  isLoading: boolean;
  isInAnyPlaylist: (trackId: string) => boolean;
  createPlaylistWithTrack: (input: {
    name: string;
    description?: string;
    trackId: string;
  }) => Promise<Playlist | null>;
  toggleTrackInPlaylist: (playlist: Playlist, trackId: string) => Promise<void>;
  refreshPlaylists: () => Promise<void>;
};

const PlaylistsContext = createContext<PlaylistsContextValue | null>(null);

function sortPlaylists(playlists: Playlist[]) {
  return [...playlists].sort((a, b) => {
    const sortA = typeof a.sortOrder === 'number' ? a.sortOrder : Number.MAX_SAFE_INTEGER;
    const sortB = typeof b.sortOrder === 'number' ? b.sortOrder : Number.MAX_SAFE_INTEGER;

    if (sortA !== sortB) {
      return sortA - sortB;
    }

    return a.name.localeCompare(b.name);
  });
}

export function PlaylistsProvider({ children }: { children: React.ReactNode }) {
  const { requireAuth, user } = useAuth();
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  async function refreshPlaylists() {
    if (!user) {
      setPlaylists([]);
      return;
    }

    setIsLoading(true);
    try {
      setPlaylists(sortPlaylists(await getPlaylists()));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void refreshPlaylists().catch(() => {
      setPlaylists([]);
      setIsLoading(false);
    });
  }, [user?.id]);

  const value = useMemo<PlaylistsContextValue>(() => {
    const isInAnyPlaylist = (trackId: string) =>
      playlists.some((playlist) => playlist.items.some((item) => item.track.id === trackId));

    const createPlaylistWithTrack = async ({
      name,
      description,
      trackId,
    }: {
      name: string;
      description?: string;
      trackId: string;
    }) => {
      if (!requireAuth()) {
        return null;
      }

      const createdPlaylist = await createPlaylist({
        name,
        description,
        trackIds: [trackId],
      });

      setPlaylists((current) => sortPlaylists([createdPlaylist, ...current]));
      return createdPlaylist;
    };

    const toggleTrackInPlaylist = async (playlist: Playlist, trackId: string) => {
      if (!requireAuth()) {
        return;
      }

      const alreadyAdded = playlist.items.some((item) => item.track.id === trackId);
      const previousPlaylists = playlists;

      try {
        const updatedPlaylist = alreadyAdded
          ? await removeTrackFromPlaylist(playlist.id, trackId)
          : await addTrackToPlaylist(playlist.id, trackId);
        setPlaylists((current) =>
          sortPlaylists(current.map((item) => (item.id === updatedPlaylist.id ? updatedPlaylist : item))),
        );
      } catch (error) {
        setPlaylists(previousPlaylists);
        throw error;
      }
    };

    return {
      playlists,
      isLoading,
      isInAnyPlaylist,
      createPlaylistWithTrack,
      toggleTrackInPlaylist,
      refreshPlaylists,
    };
  }, [isLoading, playlists, requireAuth]);

  return <PlaylistsContext.Provider value={value}>{children}</PlaylistsContext.Provider>;
}

export function usePlaylists() {
  const context = useContext(PlaylistsContext);
  if (!context) {
    throw new Error('usePlaylists must be used inside PlaylistsProvider');
  }

  return context;
}
