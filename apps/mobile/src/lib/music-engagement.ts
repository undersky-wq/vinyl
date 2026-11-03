import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system/legacy';
import { fetchJson } from './api';

export type MusicEngagement = { favorites: number; plays: number; copies: number };
let identity: Promise<string> | undefined;
function deviceIdentity() {
  if (!identity) identity = (async () => {
    const path = `${FileSystem.documentDirectory}music-device-id.txt`;
    try { const value = await FileSystem.readAsStringAsync(path); if (/^[a-f0-9]{36}$/.test(value)) return value; } catch { /* First launch. */ }
    const value = Array.from({ length: 36 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
    await FileSystem.writeAsStringAsync(path, value);
    return value;
  })().catch(error => { identity = undefined; throw error; });
  return identity;
}
export const getMusicEngagement = (id: string) => fetchJson<MusicEngagement>(`/releases/${id}/engagement`);
export async function recordMusicPlay(id: string) {
  return fetchJson<MusicEngagement>(`/releases/${id}/plays`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: await deviceIdentity() }) });
}
export async function copyMusicLink(id: string) {
  let path = `/releases/${encodeURIComponent(id)}`;
  try {
    const response = await fetch(`https://mityadima.ru/music-links?id=${encodeURIComponent(id)}`);
    if (response.ok) { const data = await response.json(); if (typeof data.path === 'string' && /^\/(mixes|tracks|releases)\//.test(data.path)) path = data.path; }
  } catch { /* The stable release URL also works offline. */ }
  const url = `https://mityadima.ru${path}`;
  await Clipboard.setStringAsync(url);
  await fetchJson(`/releases/${id}/copies`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requestId: await deviceIdentity() }) }).catch(() => undefined);
  return url;
}
