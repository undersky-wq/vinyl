// Server homepage only: authenticated data must never enter this shared cache.
const entries = new Map<string, { expiresAt: number; value: Promise<unknown> }>();

export function getPublicHomeData<T>(key: string, load: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const cached = entries.get(key);
  if (cached && cached.expiresAt > now) return cached.value as Promise<T>;
  for (const [entryKey, entry] of entries) {
    if (entry.expiresAt <= now) entries.delete(entryKey);
  }
  if (entries.size >= 32) entries.delete(entries.keys().next().value!);
  const entry = { expiresAt: Infinity, value: Promise.resolve().then(load) };
  entries.set(key, entry);
  void entry.value.then(
    () => { entry.expiresAt = Date.now() + 30_000; },
    () => { if (entries.get(key) === entry) entries.delete(key); },
  );
  return entry.value;
}
