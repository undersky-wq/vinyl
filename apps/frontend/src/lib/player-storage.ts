import type { PlayerTrack } from '../providers/player-provider';

export const PLAYER_STATE_KEY = 'vinyl-player-state';
const MAX_STATE_CHARS = 2_000_000;
const MAX_TRACKS = 20_000;
const URL_FIELDS = ['audioUrl', 'coverUrl', 'coverFullUrl', 'frontCoverUrl', 'frontCoverFullUrl', 'frontCoverMobileUrl', 'backCoverUrl', 'backCoverMobileUrl', 'backCoverMediumUrl'] as const;
const SECTIONS = new Set(['collection', 'playlists', 'mixes', 'originals', 'favorites']);

export type PlayerSnapshot = {
  queue: PlayerTrack[];
  displayQueue?: PlayerTrack[];
  currentIndex: number;
  currentTrack: PlayerTrack | null;
  volume?: number;
  isShuffleEnabled?: boolean;
  isRepeatEnabled?: boolean;
};
export type StoredPlayerState = PlayerSnapshot & { currentTime: number };
type PreparedState = { primary: string | null; minimal: string | null };
type StorageAccess = () => Pick<Storage, 'getItem' | 'setItem'>;

function trackMetadata(track: PlayerTrack) {
  return {
    id: track.id, title: track.title, artist: track.artist, releaseId: track.releaseId,
    position: track.position, coverSide: track.coverSide, isPublic: track.isPublic,
    isOriginal: track.isOriginal, queueAnchorOnly: track.queueAnchorOnly,
    playbackSource: track.playbackSource && {
      section: track.playbackSource.section, name: track.playbackSource.name, href: track.playbackSource.href,
    },
  };
}

function pack(state: PlayerSnapshot) {
  if (!state.currentTrack || state.queue.length > MAX_TRACKS || (state.displayQueue?.length || 0) > MAX_TRACKS) return null;
  const assets: string[] = [];
  const assetIds = new Map<string, number>();
  const tracks = new Map<string, PlayerTrack>();
  for (const track of [...state.queue, ...(state.displayQueue || []), state.currentTrack]) tracks.set(track.id, track);
  const anchor = state.queue.find(track => track.id === state.currentTrack!.id && track.queueAnchorOnly);
  if (anchor) tracks.set(anchor.id, { ...state.currentTrack, queueAnchorOnly: true });
  const indices = new Map([...tracks.keys()].map((id, index) => [id, index]));
  const packedTracks = [...tracks.values()].map(track => ({
    ...trackMetadata(track),
    urls: URL_FIELDS.map(field => {
      const url = track[field];
      if (!url) return -1;
      if (!assetIds.has(url)) { assetIds.set(url, assets.length); assets.push(url); }
      return assetIds.get(url)!;
    }),
  }));
  // Waveforms are fetched for the active track, never duplicated in browser storage.
  const json = JSON.stringify({
    version: 2, assets, tracks: packedTracks,
    queue: state.queue.map(track => indices.get(track.id)),
    displayQueue: (state.displayQueue || state.queue).map(track => indices.get(track.id)),
    currentTrack: indices.get(state.currentTrack.id), currentIndex: state.currentIndex,
    volume: state.volume, isShuffleEnabled: state.isShuffleEnabled, isRepeatEnabled: state.isRepeatEnabled,
  });
  return json.length <= MAX_STATE_CHARS ? json : null;
}

export function preparePlayerState(state: PlayerSnapshot): PreparedState {
  let primary: string | null = null;
  let minimal: string | null = null;
  try { minimal = pack({ ...state, queue: state.currentTrack ? [state.currentTrack] : [], displayQueue: state.currentTrack ? [state.currentTrack] : [], currentIndex: 0 }); } catch { /* Persistence is optional. */ }
  try { primary = pack(state); } catch { /* Fall back to the current track only. */ }
  return { primary, minimal };
}

export function writePlayerState(access: StorageAccess, prepared: PreparedState, currentTime: number) {
  const second = Number.isFinite(currentTime) ? Math.max(0, Math.floor(currentTime)) : 0;
  try {
    const storage = access();
    for (const base of new Set([prepared.primary, prepared.minimal])) {
      if (!base) continue;
      try {
        storage.setItem(PLAYER_STATE_KEY, `${base.slice(0, -1)},"currentTime":${second}}`);
        return true;
      } catch { /* A full or blocked store must never interrupt live playback. */ }
    }
  } catch { /* Even accessing sessionStorage can fail in restricted browsers. */ }
  return false;
}

function validTrack(value: unknown): value is PlayerTrack {
  if (!value || typeof value !== 'object') return false;
  const track = value as PlayerTrack;
  return typeof track.id === 'string' && track.id.length > 0 && typeof track.title === 'string'
    && typeof track.artist === 'string' && typeof track.audioUrl === 'string' && typeof track.coverUrl === 'string';
}

export function readPlayerState(access: StorageAccess): StoredPlayerState | null {
  try {
    const raw = access().getItem(PLAYER_STATE_KEY);
    if (!raw || raw.length > 5_000_000) return null;
    const state = JSON.parse(raw);
    if (!state || typeof state !== 'object') return null;
    let tracks: PlayerTrack[];
    let queue: PlayerTrack[];
    let displayQueue: PlayerTrack[];
    let currentTrack: PlayerTrack;
    if (state.version === 2) {
      if (!Array.isArray(state.assets) || !state.assets.every((url: unknown) => typeof url === 'string')
        || !Array.isArray(state.tracks) || state.tracks.length > MAX_TRACKS
        || !Array.isArray(state.queue) || !Array.isArray(state.displayQueue)) return null;
      tracks = state.tracks.map((entry: Record<string, unknown>) => {
        if (!entry || !Array.isArray(entry.urls) || ![7, URL_FIELDS.length].includes(entry.urls.length)) throw Error('Invalid saved track');
        const track = { ...trackMetadata(entry as PlayerTrack), audioUrl: '', coverUrl: '' } as PlayerTrack;
        entry.urls.forEach((assetId, index) => {
          if (assetId === -1) return;
          if (!Number.isInteger(assetId) || assetId < 0 || assetId >= state.assets.length) throw Error('Invalid saved URL');
          track[URL_FIELDS[index]] = state.assets[assetId];
        });
        if (!validTrack(track)) throw Error('Invalid saved track');
        return track;
      });
      const restore = (ids: unknown[]) => ids.map(index => {
        if (typeof index !== 'number' || !Number.isInteger(index) || !tracks[index]) throw Error('Invalid saved queue');
        return tracks[index];
      });
      if (state.queue.length > MAX_TRACKS || state.displayQueue.length > MAX_TRACKS) return null;
      queue = restore(state.queue);
      displayQueue = restore(state.displayQueue);
      currentTrack = restore([state.currentTrack])[0];
    } else {
      // Read existing sessions too, dropping their old waveform payloads once.
      if (!validTrack(state.currentTrack) || !Array.isArray(state.queue) || state.queue.length > MAX_TRACKS || !state.queue.every(validTrack)) return null;
      const trim = (track: PlayerTrack): PlayerTrack => {
        const { waveformData: _waveform, ...rest } = track;
        return rest;
      };
      queue = state.queue.map(trim);
      displayQueue = Array.isArray(state.displayQueue) && state.displayQueue.length <= MAX_TRACKS && state.displayQueue.every(validTrack) ? state.displayQueue.map(trim) : queue;
      currentTrack = trim(state.currentTrack);
    }
    if (currentTrack.playbackSource && !SECTIONS.has(currentTrack.playbackSource.section)) return null;
    const currentIndex = queue.findIndex(track => track.id === currentTrack.id);
    if (currentIndex < 0) { queue = [currentTrack]; displayQueue = [currentTrack]; }
    return {
      queue, displayQueue, currentTrack, currentIndex: Math.max(0, currentIndex),
      currentTime: Number.isFinite(state.currentTime) ? Math.max(0, state.currentTime) : 0,
      volume: Number.isFinite(state.volume) ? Math.max(0, Math.min(1, state.volume)) : undefined,
      isShuffleEnabled: state.isShuffleEnabled === true, isRepeatEnabled: state.isRepeatEnabled === true,
    };
  } catch { return null; }
}
