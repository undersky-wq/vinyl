import type { PlayerTrack } from '../types';

// Serialize native queue mutations; a later tap invalidates pending work from earlier taps.
export function createPlaybackRequests() {
  let current = 0;
  let pending: Promise<unknown> = Promise.resolve();
  return {
    begin: () => ++current,
    isCurrent: (request: number) => request === current,
    run<T>(request: number, action: () => Promise<T>): Promise<T | undefined> {
      const result = pending.then(() => request === current ? action() : undefined);
      pending = result.catch(() => undefined);
      return result;
    },
  };
}

export function createQueueLoader(load: () => Promise<PlayerTrack[]>, ttlMs = 30000) {
  let pending: Promise<PlayerTrack[]> | undefined;
  let cached: PlayerTrack[] | undefined;
  let loadedAt = 0;
  return () => {
    if (cached && Date.now() - loadedAt < ttlMs) return Promise.resolve(cached);
    if (!pending) {
      pending = load().then((queue) => {
        cached = queue;
        loadedAt = Date.now();
        return queue;
      }).finally(() => { pending = undefined; });
    }
    return pending;
  };
}

type NativeTrack = { id?: string };
type NativeQueue<T extends NativeTrack> = {
  getQueue: () => Promise<T[]>;
  getActiveTrack: () => Promise<T | undefined>;
  remove: (indexes: number[]) => Promise<void>;
  add: (tracks: T[], insertBeforeIndex?: number) => Promise<unknown>;
};

// Keep the playing native item itself. No reset, seek, skip, pause or play here.
export async function replaceQueueAroundActiveTrack<T extends NativeTrack>(
  player: NativeQueue<T>,
  tracks: T[],
  activeId: string,
  isCurrent: () => boolean,
) {
  const desiredIndex = tracks.findIndex((track) => track.id === activeId);
  if (desiredIndex < 0 || !isCurrent()) return false;
  const existing = await player.getQueue();
  const active = await player.getActiveTrack();
  if (active?.id !== activeId || !isCurrent()) return false;
  const removeIndexes = existing.flatMap((track, index) => track.id === activeId ? [] : [index]);
  if (removeIndexes.length) await player.remove(removeIndexes);
  if (!isCurrent() || (await player.getActiveTrack())?.id !== activeId) return false;
  // Add upcoming tracks first, so even a very short playing item has a successor.
  const after = tracks.slice(desiredIndex + 1);
  if (after.length) await player.add(after);
  if (!isCurrent() || (await player.getActiveTrack())?.id !== activeId) return false;
  const before = tracks.slice(0, desiredIndex);
  if (before.length) await player.add(before, 0);
  return isCurrent();
}
