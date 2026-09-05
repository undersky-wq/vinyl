import * as FileSystem from 'expo-file-system/legacy';
import { PlayerTrack } from '../types';

const OFFLINE_AUDIO_DIR = `${FileSystem.documentDirectory || ''}offline-audio/`;
const offlineUris = new Map<string, string | null>();
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
  const uri = file.exists ? fileUri : null;
  offlineUris.set(trackId, uri);
  return uri;
}

export async function resolveOfflineTrack(track: PlayerTrack): Promise<PlayerTrack> {
  const localAudioUrl = await getOfflineAudioUri(track.id);
  return { ...track, localAudioUrl };
}

export async function downloadTrackAudio(track: PlayerTrack) {
  const fileUri = getTrackFileUri(track.id);

  if (!fileUri) {
    throw new Error('Offline storage is unavailable.');
  }

  const existingUri = await getOfflineAudioUri(track.id);

  if (existingUri) {
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

  await FileSystem.moveAsync({ from: result.uri, to: fileUri });
  offlineUris.set(track.id, fileUri);
  return fileUri;
}
