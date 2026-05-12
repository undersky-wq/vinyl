import * as FileSystem from 'expo-file-system/legacy';

const ARTWORK_DIR = `${FileSystem.cacheDirectory || FileSystem.documentDirectory || ''}lockscreen-artwork/`;

function getArtworkFileUri(trackId: string) {
  if (!FileSystem.cacheDirectory && !FileSystem.documentDirectory) {
    return null;
  }

  return `${ARTWORK_DIR}${encodeURIComponent(trackId)}.jpg`;
}

async function ensureArtworkDirectory() {
  const directory = await FileSystem.getInfoAsync(ARTWORK_DIR);

  if (!directory.exists) {
    await FileSystem.makeDirectoryAsync(ARTWORK_DIR, { intermediates: true });
  }
}

export async function getLockScreenArtworkUrl(trackId: string, coverUrl: string) {
  const fileUri = getArtworkFileUri(trackId);

  if (!fileUri || !coverUrl) {
    return coverUrl;
  }

  const existing = await FileSystem.getInfoAsync(fileUri);
  if (existing.exists) {
    return fileUri;
  }

  try {
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
