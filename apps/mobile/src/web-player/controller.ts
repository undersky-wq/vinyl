import TrackPlayer, { AppKilledPlaybackBehavior, Capability, RepeatMode, State, type Track } from 'react-native-track-player';
import CookieManager from '@react-native-cookies/cookies';
import { replaceQueueAroundActiveTrack } from '../lib/playback-queue';

export const SITE_URL = 'https://mityadima.ru';
type WebTrack = { id: string; title: string; artist: string; audioUrl: string; coverUrl: string; releaseId?: string; isPublic?: boolean; waveformData?: number[] };
type BridgeTrack = Track & { id: string; webTrack: WebTrack };
let ready: Promise<void> | undefined;
let pending: Promise<unknown> = Promise.resolve();
let queue: WebTrack[] = [];
let displayIds: string[] = [];
let shuffle = false;
let repeat = false;
let volume = .8;
let pendingPercent: number | undefined;
let lastRecovery = '';
let publish: ((full?: boolean) => void) | undefined;

export function attachPublisher(callback?: (full?: boolean) => void) { publish = callback; }
export function notifyPlayer(full = false) { publish?.(full); }
export function serialize<T>(action: () => Promise<T>): Promise<T> {
  const result = pending.then(action);
  pending = result.catch(() => undefined);
  return result;
}

export function ensurePlayer() {
  if (!ready) ready = (async () => {
    try { await TrackPlayer.setupPlayer({ autoHandleInterruptions: true, autoUpdateMetadata: true }); }
    catch (error) {
      if (!String(error).includes('already') && (error as { code?: string }).code !== 'player_already_initialized') throw error;
    }
    await TrackPlayer.updateOptions({
      android: { appKilledPlaybackBehavior: AppKilledPlaybackBehavior.ContinuePlayback },
      capabilities: [Capability.Play, Capability.Pause, Capability.SkipToNext, Capability.SkipToPrevious, Capability.SeekTo],
      compactCapabilities: [Capability.SkipToPrevious, Capability.Play, Capability.SkipToNext],
      progressUpdateEventInterval: .5,
    });
    const restored = await TrackPlayer.getQueue() as BridgeTrack[];
    if (!queue.length) queue = restored.flatMap(track => track.webTrack ? [track.webTrack] : []);
  })().catch(error => { ready = undefined; throw error; });
  return ready;
}

function allowedMedia(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && (url.hostname === 'mityadima.ru' || url.hostname.endsWith('.selcloud.ru'));
  } catch { return false; }
}

function parseTracks(value: unknown): WebTrack[] {
  if (!Array.isArray(value) || !value.length || value.length > 5000) throw new Error('Некорректная очередь воспроизведения.');
  return value.map(track => {
    if (!track || typeof track.id !== 'string' || track.id.length > 128 || !allowedMedia(track.audioUrl)) throw new Error('Некорректная ссылка на трек.');
    return { id: track.id, title: String(track.title || '').slice(0, 1000), artist: String(track.artist || '').slice(0, 1000),
      audioUrl: track.audioUrl, coverUrl: allowedMedia(track.coverUrl) ? track.coverUrl : '',
      releaseId: typeof track.releaseId === 'string' ? track.releaseId : undefined,
      isPublic: Boolean(track.isPublic),
      waveformData: Array.isArray(track.waveformData) ? track.waveformData.filter((n: unknown) => typeof n === 'number' && Number.isFinite(n)).slice(0, 10000) : undefined };
  });
}

function nativeTrack(track: WebTrack): BridgeTrack {
  return { id: track.id, url: track.audioUrl, title: track.title, artist: track.artist,
    artwork: track.coverUrl || undefined, webTrack: track };
}
const nativeQueue = {
  getQueue: async () => await TrackPlayer.getQueue() as BridgeTrack[],
  getActiveTrack: async () => await TrackPlayer.getActiveTrack() as BridgeTrack | undefined,
  remove: TrackPlayer.remove,
  add: TrackPlayer.add,
};
const bounded = (value: unknown, min: number, max: number) => Math.max(min, Math.min(max, typeof value === 'number' && Number.isFinite(value) ? value : min));

async function refreshed(track: WebTrack): Promise<WebTrack> {
  const cookies = await CookieManager.get(SITE_URL);
  const session = cookies.vinyl_session;
  const response = await fetch(`${SITE_URL}/api/tracks/${encodeURIComponent(track.id)}/player`, {
    headers: session ? { Cookie: `vinyl_session=${session.value}` } : {},
  });
  if (!response.ok) throw new Error('Не удалось обновить ссылку на аудио. Откройте приложение и проверьте вход.');
  const data = await response.json();
  if (!allowedMedia(data.audioUrl)) throw new Error('Аудиофайл недоступен.');
  return { ...track, audioUrl: data.audioUrl, coverUrl: allowedMedia(data.coverUrl) ? data.coverUrl : track.coverUrl };
}

async function applyRepeat() { await TrackPlayer.setRepeatMode(repeat || shuffle ? RepeatMode.Queue : RepeatMode.Off); }

async function orderedTracks() {
  const active = await TrackPlayer.getActiveTrack();
  if (!shuffle || !active) return queue.map(nativeTrack);
  const rest = queue.filter(track => track.id !== active.id).map(nativeTrack);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  const current = queue.find(track => track.id === active.id);
  return current ? [nativeTrack(current), ...rest] : rest;
}

export async function skip(direction: 1 | -1) {
  const progress = await TrackPlayer.getProgress();
  if (direction === -1 && progress.position > 3) { await TrackPlayer.seekTo(0); return; }
  const items = await TrackPlayer.getQueue();
  const index = await TrackPlayer.getActiveTrackIndex();
  if (index === undefined || !items.length) return;
  let next = index + direction;
  if (next < 0 || next >= items.length) {
    if (!repeat && !shuffle) return;
    next = (next + items.length) % items.length;
  }
  await TrackPlayer.skip(next);
  await TrackPlayer.play();
}

export async function applyPendingSeek() {
  if (pendingPercent === undefined) return;
  const { duration } = await TrackPlayer.getProgress();
  if (duration > 0) {
    const percent = pendingPercent;
    pendingPercent = undefined;
    await TrackPlayer.seekTo(duration * percent / 100);
  }
}

export async function recoverPlayback() {
  const active = await TrackPlayer.getActiveTrack() as BridgeTrack | undefined;
  if (!active?.webTrack || lastRecovery === `${active.id}:${active.url}`) return;
  lastRecovery = `${active.id}:${active.url}`;
  const { position } = await TrackPlayer.getProgress();
  const wasPlaying = await TrackPlayer.getPlayWhenReady();
  const fresh = await refreshed(active.webTrack);
  queue = queue.map(track => track.id === fresh.id ? fresh : track);
  await TrackPlayer.load(nativeTrack(fresh));
  await TrackPlayer.seekTo(position);
  if (wasPlaying) await TrackPlayer.play();
  notifyPlayer(true);
}

export async function playerSnapshot(full = false) {
  const [active, progress, playback, playWhenReady] = await Promise.all([
    TrackPlayer.getActiveTrack(), TrackPlayer.getProgress(), TrackPlayer.getPlaybackState(), TrackPlayer.getPlayWhenReady(),
  ]);
  return {
    ...(full ? { queue, displayIds } : {}), trackId: active?.id,
    position: progress.position, duration: progress.duration,
    playing: playWhenReady && playback.state !== State.Ended && playback.state !== State.Error,
    shuffle, repeat, volume,
  };
}

export async function playerCommand(message: Record<string, unknown>) {
  await ensurePlayer();
  switch (message.type) {
    case 'sync': break;
    case 'queue': {
      const tracks = parseTracks(message.tracks);
      const index = Math.floor(bounded(message.index, 0, tracks.length - 1));
      const active = await TrackPlayer.getActiveTrack();
      const preserve = message.preserve === true && tracks.some(track => track.id === active?.id);
      if (!preserve) {
        // Refresh before starting, because a page can retain signed URLs for hours.
        tracks[index] = await refreshed(tracks[index]);
      }
      queue = tracks;
      displayIds = Array.isArray(message.displayIds) ? message.displayIds.filter((id): id is string => typeof id === 'string' && tracks.some(track => track.id === id)) : tracks.map(track => track.id);
      if (preserve) await replaceQueueAroundActiveTrack(nativeQueue, await orderedTracks(), String(active?.id), () => true);
      else {
        pendingPercent = bounded(message.percent, 0, 100);
        await TrackPlayer.pause();
        await TrackPlayer.setQueue(tracks.map(nativeTrack));
        await TrackPlayer.skip(index);
        if (shuffle) await replaceQueueAroundActiveTrack(nativeQueue, await orderedTracks(), tracks[index].id, () => true);
        await TrackPlayer.setVolume(volume);
        await applyRepeat();
        if (message.autoplay !== false) await TrackPlayer.play();
      }
      break;
    }
    case 'play': await TrackPlayer.play(); break;
    case 'pause': await TrackPlayer.pause(); break;
    case 'next': await skip(1); break;
    case 'previous': await skip(-1); break;
    case 'seek': {
      const { duration } = await TrackPlayer.getProgress();
      const position = message.percent !== undefined ? duration * bounded(message.percent, 0, 100) / 100 : bounded(message.position, 0, duration || Number.MAX_SAFE_INTEGER);
      pendingPercent = undefined;
      await TrackPlayer.seekTo(position); break;
    }
    case 'volume': volume = bounded(message.value, 0, 1); await TrackPlayer.setVolume(volume); break;
    case 'repeat': repeat = message.value === true; await applyRepeat(); break;
    case 'shuffle': {
      shuffle = message.value === true;
      const active = await TrackPlayer.getActiveTrack();
      if (active) await replaceQueueAroundActiveTrack(nativeQueue, await orderedTracks(), String(active.id), () => true);
      await applyRepeat(); break;
    }
    default: throw new Error('Неизвестная команда плеера.');
  }
  notifyPlayer(true);
}
