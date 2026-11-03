export function createShuffleCycle(random = Math.random) {
  const played = new Set<string>();
  return {
    reset() { played.clear(); },
    next(tracks: { id: string }[], currentIndex: number) {
      if (tracks.length <= 1) return currentIndex;
      const current = tracks[currentIndex]?.id;
      if (current) played.add(current);
      const available = () => tracks.map((track, index) => ({ id: track.id, index }))
        .filter(track => track.id !== current && !played.has(track.id));
      let candidates = available();
      if (!candidates.length) {
        played.clear();
        if (current) played.add(current);
        candidates = available();
      }
      if (!candidates.length) return currentIndex;
      const chosen = candidates[Math.min(candidates.length - 1, Math.floor(random() * candidates.length))];
      played.add(chosen.id);
      return chosen.index;
    },
  };
}
