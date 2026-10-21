import * as FileSystem from 'expo-file-system/legacy';
import { getDownloadedTracks } from './offline-audio';

const DIRECTORY = `${FileSystem.documentDirectory || ''}offline-catalog/`;
export function isCatalogRequest(path: string) {
  return path === '/releases' || path.startsWith('/releases?')
    || /^\/releases\/(styles|library-feed|library-queue)(\?|$)/.test(path)
    || /^\/releases\/[^/?]+$/.test(path);
}
function filename(path: string) {
  let hash = 2166136261;
  for (const char of path) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return `${DIRECTORY}${(hash >>> 0).toString(16)}.json`;
}
function withoutAudioLinks(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutAudioLinks);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key,
    ['audioUrl', 'storageUrl', 'normalizedStorageUrl', 'storageKey', 'normalizedStorageKey'].includes(key)
      ? null : withoutAudioLinks(item)]));
}
export async function saveCatalog(path: string, value: unknown) {
  if (!FileSystem.documentDirectory || !isCatalogRequest(path)) return;
  try {
    const data = JSON.stringify({ path, savedAt: Date.now(), value: withoutAudioLinks(value) });
    if (data.length > 2_000_000) return;
    await FileSystem.makeDirectoryAsync(DIRECTORY, { intermediates: true });
    await FileSystem.writeAsStringAsync(filename(path), data);
    const files = await FileSystem.readDirectoryAsync(DIRECTORY);
    if (files.length > 100) {
      const entries = await Promise.all(files.map(async name => ({ name, info: await FileSystem.getInfoAsync(`${DIRECTORY}${name}`) })));
      entries.sort((a, b) => (a.info.exists ? a.info.modificationTime : 0) - (b.info.exists ? b.info.modificationTime : 0));
      await Promise.all(entries.slice(0, entries.length - 100).map(entry => FileSystem.deleteAsync(`${DIRECTORY}${entry.name}`, { idempotent: true })));
    }
  } catch { /* A full disk must not prevent online browsing. */ }
}
export async function readCatalog<T>(path: string): Promise<{ value: T } | null> {
  if (!FileSystem.documentDirectory || !isCatalogRequest(path)) return null;
  try {
    const cached = JSON.parse(await FileSystem.readAsStringAsync(filename(path)));
    if (cached.path !== path) return null;
    const downloads = new Map((await getDownloadedTracks()).map(track => [track.id, track]));
    function hydrate(value: any): any {
      if (Array.isArray(value)) return value.map(hydrate);
      if (!value || typeof value !== 'object') return value;
      const result = Object.fromEntries(Object.entries(value).map(([key, item]) => [key, hydrate(item)]));
      const local = downloads.get(value.id);
      if (local) {
        if ('audioUrl' in value) { result.audioUrl = local.audioUrl; result.localAudioUrl = local.audioUrl; }
        if (Array.isArray(value.audioFiles)) {
          result.audioFiles = [{ ...(result.audioFiles?.[0] || {}), storageUrl: local.audioUrl, normalizedStorageUrl: local.audioUrl }];
        }
      }
      return result;
    }
    return { value: hydrate(cached.value) as T };
  } catch { return null; }
}
