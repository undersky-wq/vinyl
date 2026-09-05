import { useEffect, useState } from 'react';
import { DEFAULT_PLAYER_PALETTE, getCachedPlayerPalette, loadPlayerPalette, PlayerPalette } from './player-palette';

export function useCoverPalette(coverUrl?: string, enabled = true): PlayerPalette {
  const [resolved, setResolved] = useState<{ uri: string; palette: PlayerPalette } | null>(null);
  useEffect(() => {
    if (!enabled || !coverUrl) return;
    let cancelled = false;
    void loadPlayerPalette(coverUrl).then((palette) => {
      if (!cancelled) setResolved({ uri: coverUrl, palette });
    });
    return () => { cancelled = true; };
  }, [coverUrl, enabled]);

  const cached = getCachedPlayerPalette(coverUrl);
  if (cached) return cached;
  if (!coverUrl) return DEFAULT_PLAYER_PALETTE;

  // Keep the current color while the next cover is analysed. PlayerBackdrop
  // then crossfades directly from that color instead of flashing the fallback.
  return resolved?.palette || DEFAULT_PLAYER_PALETTE;
}
