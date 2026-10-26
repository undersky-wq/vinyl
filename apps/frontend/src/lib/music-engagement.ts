export type MusicEngagement = { favorites: number; plays: number; copies: number };

type CopyReceipt = { requestId: string; completed: boolean };
const copyReceipts = new Map<string, CopyReceipt>();
const pendingCopies = new Map<string, Promise<MusicEngagement>>();

function saveCopyReceipt(storageKey: string, receipt: CopyReceipt) {
  copyReceipts.set(storageKey, receipt);
  try { localStorage.setItem(storageKey, JSON.stringify(receipt)); } catch { /* Keep session deduplication when storage is unavailable. */ }
}

async function recordCopyOnce(id: string, storageKey: string): Promise<MusicEngagement> {
  let receipt = copyReceipts.get(storageKey);
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (stored && typeof stored.requestId === 'string' && /^[a-f0-9]{36}$/.test(stored.requestId) && typeof stored.completed === 'boolean') receipt = stored;
  } catch { /* Fall back to an in-memory receipt. */ }
  if (receipt?.completed) return getMusicEngagement(id);
  if (!receipt) receipt = {
    requestId: Array.from(crypto.getRandomValues(new Uint8Array(18)), byte => byte.toString(16).padStart(2, '0')).join(''),
    completed: false,
  };
  // Persist before sending so retries reuse the server's idempotency key.
  saveCopyReceipt(storageKey, receipt);
  const response = await fetch(`/api/releases/${encodeURIComponent(id)}/copies`, {
    method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requestId: receipt.requestId }),
  });
  if (!response.ok) throw new Error('Unable to record link copy');
  const result = await response.json();
  saveCopyReceipt(storageKey, { ...receipt, completed: true });
  window.dispatchEvent(new CustomEvent('music-engagement', { detail: id }));
  return result;
}

export function recordMusicLinkCopy(id: string, userId?: string): Promise<MusicEngagement> {
  const storageKey = userId ? `vinyl:link-copy:account:${userId}:${id}` : `vinyl:link-copy:${id}`;
  const pending = pendingCopies.get(storageKey);
  if (pending) return pending;
  const request = recordCopyOnce(id, storageKey).finally(() => pendingCopies.delete(storageKey));
  pendingCopies.set(storageKey, request);
  return request;
}

export async function getMusicEngagement(id: string): Promise<MusicEngagement> {
  const response = await fetch(`/api/releases/${encodeURIComponent(id)}/engagement`, { cache: 'no-store' });
  if (!response.ok) throw new Error('Unable to load music counters');
  return response.json();
}

export async function recordMusicPlay(id: string, sessionId: string) {
  const response = await fetch(`/api/releases/${encodeURIComponent(id)}/plays`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId }),
  });
  if (!response.ok) throw new Error('Unable to record playback');
  window.dispatchEvent(new CustomEvent('music-engagement', { detail: id }));
}
