import * as FileSystem from 'expo-file-system/legacy';
import { PlayerTrack } from '../types';

const OFFLINE_AUDIO_DIR = `${FileSystem.documentDirectory || ''}offline-audio/`;
const offlineUris = new Map<string, string | null>();
const downloads = new Map<string, Promise<string>>();
let indexReady: Promise<void> | undefined;

export function warmOfflineAudioIndex(): Promise<void> {
  if (!indexReady) {
    indexReady = (async () => {
      if (!FileSystem.documentDirectory) return;
      const directory = await FileSystem.getInfoAsync(OFFLINE_AUDIO_DIR);
      if (!directory.exists) return;
      const files = await FileSystem.readDirectoryAsync(OFFLINE_AUDIO_DIR);
      for (const name of files) {
        if (!name.endsWith('.mp3')) continue;
        try {
          offlineUris.set(decodeURIComponent(name.slice(0, -4)), `${OFFLINE_AUDIO_DIR}${name}`);
        } catch {
          // Ignore unrelated or malformed filenames.
        }
      }
    })().catch(() => { indexReady = undefined; });
  }
  return indexReady;
}

export function withCachedOfflineAudio(track: PlayerTrack): PlayerTrack {
  return { ...track, localAudioUrl: offlineUris.get(track.id) ?? null };
}

function getTrackFileUri(trackId: string) {
  if (!FileSystem.documentDirectory) {
    return null;
  }

  return `${OFFLINE_AUDIO_DIR}${encodeURIComponent(trackId)}.mp3`;
}

async function ensureOfflineDirectory() {
  if (!FileSystem.documentDirectory) {
    throw new Error('Offline storage is unavailable.');
  }

  const directory = await FileSystem.getInfoAsync(OFFLINE_AUDIO_DIR);

  if (!directory.exists) {
    await FileSystem.makeDirectoryAsync(OFFLINE_AUDIO_DIR, { intermediates: true });
  }
}

export async function getOfflineAudioUri(trackId: string) {
  const fileUri = getTrackFileUri(trackId);

  if (!fileUri) {
    return null;
  }

  const file = await FileSystem.getInfoAsync(fileUri);
  const uri = file.exists && !file.isDirectory && file.size > 0 ? fileUri : null;
  offlineUris.set(trackId, uri);
  return uri;
}

export async function resolveOfflineTrack(track: PlayerTrack): Promise<PlayerTrack> {
  const localAudioUrl = await getOfflineAudioUri(track.id);
  return { ...track, localAudioUrl };
}

async function saveDownloadDetails(track: PlayerTrack) {
  const fileUri = getTrackFileUri(track.id);
  if (!fileUri) throw new Error('Offline storage is unavailable.');
  // Persist descriptions, never expiring signed audio URLs or authentication data.
  const details = { id: track.id, title: track.title, artist: track.artist,
    releaseId: track.releaseId, durationRaw: track.durationRaw, durationSec: track.durationSec,
    waveformData: track.waveformData, isMix: track.isMix, isPublic: track.isPublic };
  const temp = `${fileUri}.json.tmp`;
  await FileSystem.writeAsStringAsync(temp, JSON.stringify(details));
  await FileSystem.moveAsync({ from: temp, to: `${fileUri}.json` });
}

export async function getDownloadedTracks(): Promise<PlayerTrack[]> {
  await ensureOfflineDirectory();
  const names = await FileSystem.readDirectoryAsync(OFFLINE_AUDIO_DIR);
  const tracks = await Promise.all(names.filter(name => name.endsWith('.mp3')).map(async name => {
    try {
      const id = decodeURIComponent(name.slice(0, -4));
      const uri = await getOfflineAudioUri(id);
      if (!uri) return null;
      let details: Partial<PlayerTrack> = {};
      try { details = JSON.parse(await FileSystem.readAsStringAsync(`${uri}.json`)); } catch { /* Older downloads have no descriptions. */ }
      return { ...details, id, title: typeof details.title === 'string' ? details.title : 'Сохранённый трек',
        artist: typeof details.artist === 'string' ? details.artist : '',
        audioUrl: uri, localAudioUrl: uri, coverUrl: '' } as PlayerTrack;
    } catch { return null; }
  }));
  return tracks.filter((track): track is PlayerTrack => track !== null)
    .sort((a, b) => a.artist.localeCompare(b.artist) || a.title.localeCompare(b.title));
}

async function downloadAudio(track: PlayerTrack) {
  const fileUri = getTrackFileUri(track.id);

  if (!fileUri) {
    throw new Error('Offline storage is unavailable.');
  }

  const existingUri = await getOfflineAudioUri(track.id);

  if (existingUri) {
    await saveDownloadDetails(track);
    return existingUri;
  }

  await ensureOfflineDirectory();

  const tempUri = `${fileUri}.download`;
  await FileSystem.deleteAsync(tempUri, { idempotent: true });

  const result = await FileSystem.downloadAsync(track.audioUrl, tempUri);

  if (result.status < 200 || result.status >= 300) {
    await FileSystem.deleteAsync(tempUri, { idempotent: true });
    throw new Error(`Download failed: ${result.status}`);
  }

  const downloaded = await FileSystem.getInfoAsync(result.uri);
  if (!downloaded.exists || downloaded.isDirectory || downloaded.size === 0) {
    await FileSystem.deleteAsync(tempUri, { idempotent: true });
    throw new Error('The downloaded audio file is empty.');
  }

  await FileSystem.moveAsync({ from: result.uri, to: fileUri });
  await saveDownloadDetails(track);
  offlineUris.set(track.id, fileUri);
  return fileUri;
}

export function downloadTrackAudio(track: PlayerTrack): Promise<string> {
  const pending = downloads.get(track.id);
  if (pending) return pending;
  const request = downloadAudio(track).finally(() => downloads.delete(track.id));
  downloads.set(track.id, request);
  return request;
}
