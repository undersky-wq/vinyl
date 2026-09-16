import * as FileSystem from 'expo-file-system/legacy';

const ARTWORK_DIR = `${FileSystem.cacheDirectory || FileSystem.documentDirectory || ''}lockscreen-artwork/`;
const pendingArtwork = new Map<string, Promise<string>>();

function getArtworkExtension(coverUrl: string) {
  const path = coverUrl.split(/[?#]/, 1)[0].toLowerCase();
  const match = path.match(/\.(jpe?g|png|webp)$/);
  if (!match) return 'jpg';
  return match[1] === 'jpeg' ? 'jpg' : match[1];
}

function getArtworkFileUri(trackId: string, coverUrl: string) {
  if (!FileSystem.cacheDirectory && !FileSystem.documentDirectory) {
    return null;
  }

  // A changed or higher-resolution URL must not reuse an old thumbnail.
  let hash = 2166136261;
  for (let i = 0; i < coverUrl.length; i++) {
    hash = Math.imul(hash ^ coverUrl.charCodeAt(i), 16777619);
  }
  return `${ARTWORK_DIR}${encodeURIComponent(trackId)}-${(hash >>> 0).toString(16)}.${getArtworkExtension(coverUrl)}`;
}

async function ensureArtworkDirectory() {
  const directory = await FileSystem.getInfoAsync(ARTWORK_DIR);

  if (!directory.exists) {
    await FileSystem.makeDirectoryAsync(ARTWORK_DIR, { intermediates: true });
  }
}

async function cacheLockScreenArtwork(trackId: string, coverUrl: string) {
  if (coverUrl.startsWith('file:') || coverUrl.startsWith('content:')) return coverUrl;
  const fileUri = getArtworkFileUri(trackId, coverUrl);

  if (!fileUri || !coverUrl) {
    return coverUrl;
  }

  const existing = await FileSystem.getInfoAsync(fileUri);
  if (existing.exists && (!('size' in existing) || (existing.size || 0) > 0)) {
    return fileUri;
  }

  try {
    if (existing.exists) {
      await FileSystem.deleteAsync(fileUri, { idempotent: true });
    }
    await ensureArtworkDirectory();
    const tempUri = `${fileUri}.download`;
    await FileSystem.deleteAsync(tempUri, { idempotent: true });

    const result = await FileSystem.downloadAsync(coverUrl, tempUri);
    if (result.status < 200 || result.status >= 300) {
      await FileSystem.deleteAsync(tempUri, { idempotent: true });
      return coverUrl;
    }

    await FileSystem.moveAsync({ from: result.uri, to: fileUri });
    return fileUri;
  } catch {
    return coverUrl;
  }
}

export function getLockScreenArtworkUrl(trackId: string, coverUrl: string) {
  if (!coverUrl) return Promise.resolve(coverUrl);
  const key = `${trackId}:${coverUrl}`;
  const inFlight = pendingArtwork.get(key);
  if (inFlight) return inFlight;
  const request = cacheLockScreenArtwork(trackId, coverUrl)
    .finally(() => pendingArtwork.delete(key));
  pendingArtwork.set(key, request);
  return request;
}
