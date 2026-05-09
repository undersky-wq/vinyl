import * as FileSystem from 'expo-file-system/legacy';
import { PlayerTrack } from '../types';

const OFFLINE_AUDIO_DIR = `${FileSystem.documentDirectory || ''}offline-audio/`;

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
  return file.exists ? fileUri : null;
}

export async function resolveOfflineTrack(track: PlayerTrack): Promise<PlayerTrack> {
  const localAudioUrl = await getOfflineAudioUri(track.id);
  return localAudioUrl ? { ...track, localAudioUrl } : track;
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
  return fileUri;
}
