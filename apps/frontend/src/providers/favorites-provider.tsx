'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { getFavorites, toggleFavoriteTrack } from '../lib/api';
import { useAuth } from './auth-provider';

type FavoritesContextValue = {
  favoriteTrackIds: string[];
  isFavorite: (trackId: string) => boolean;
  toggleFavorite: (trackId: string) => Promise<void>;
};

const FavoritesContext = createContext<FavoritesContextValue | null>(null);

export function FavoritesProvider({
  children,
  initialFavoriteTrackIds = [],
}: {
  children: React.ReactNode;
  initialFavoriteTrackIds?: string[];
}) {
  const { requireAuth, user } = useAuth();
  const [favoriteTrackIds, setFavoriteTrackIds] = useState<string[]>(initialFavoriteTrackIds);

  useEffect(() => {
    if (!user) {
      setFavoriteTrackIds([]);
      return;
    }

    void getFavorites()
      .then(setFavoriteTrackIds)
      .catch(() => undefined);
  }, [user?.id]);

  const value = useMemo<FavoritesContextValue>(() => {
    const isFavorite = (trackId: string) => favoriteTrackIds.includes(trackId);

    const toggleFavorite = async (trackId: string) => {
      if (!requireAuth()) {
        return;
      }

      const wasFavorite = favoriteTrackIds.includes(trackId);
      setFavoriteTrackIds((current) =>
        wasFavorite ? current.filter((id) => id !== trackId) : [...new Set([...current, trackId])],
      );

      try {
        const result = await toggleFavoriteTrack(trackId);
        setFavoriteTrackIds((current) =>
          result.active
            ? [...new Set([...current, trackId])]
            : current.filter((id) => id !== trackId),
        );
      } catch {
        setFavoriteTrackIds((current) =>
          wasFavorite
            ? [...new Set([...current, trackId])]
            : current.filter((id) => id !== trackId),
        );
      }
    };

    return {
      favoriteTrackIds,
      isFavorite,
      toggleFavorite,
    };
  }, [favoriteTrackIds, requireAuth]);

  return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>;
}

export function useFavorites() {
  const context = useContext(FavoritesContext);
  if (!context) {
    throw new Error('useFavorites must be used inside FavoritesProvider');
  }

  return context;
}
