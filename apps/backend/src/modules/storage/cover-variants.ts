import { createHash } from 'node:crypto';
import sharp from 'sharp';
import type { StorageService } from './storage.service';

type CoverStorage = Pick<StorageService, 'objectExists' | 'openDownload' | 'uploadObject'>;
export type CoverVariantKeys = { thumbStorageKey: string; mediumStorageKey: string };
const pending = new WeakMap<CoverStorage, Map<string, Promise<CoverVariantKeys>>>();

export function coverVariantKeys(sourceKey: string): CoverVariantKeys {
  const hash = createHash('sha256').update(sourceKey).digest('hex');
  return { thumbStorageKey: `covers/variants/v1/${hash}/thumb.webp`, mediumStorageKey: `covers/variants/v1/${hash}/medium.webp` };
}

export function ensureCoverVariants(storage: CoverStorage, bucket: string, sourceKey: string, source?: Buffer, preferred?: { thumbStorageKey?: string | null; mediumStorageKey?: string | null }): Promise<CoverVariantKeys> {
  if (!sourceKey.startsWith('covers/') || sourceKey.split('/').some(part => part === '..' || part === '.')) throw new Error('Invalid cover source');
  const keys = coverVariantKeys(sourceKey);
  if (preferred?.thumbStorageKey?.startsWith('covers/') && /(?:\/thumb|-thumb)\.webp$/.test(preferred.thumbStorageKey) && preferred.thumbStorageKey !== sourceKey) keys.thumbStorageKey = preferred.thumbStorageKey;
  if (preferred?.mediumStorageKey?.startsWith('covers/') && /(?:\/medium|-medium)\.webp$/.test(preferred.mediumStorageKey) && preferred.mediumStorageKey !== sourceKey && preferred.mediumStorageKey !== keys.thumbStorageKey) keys.mediumStorageKey = preferred.mediumStorageKey;
  let jobs = pending.get(storage);
  if (!jobs) { jobs = new Map(); pending.set(storage, jobs); }
  const identity = `${bucket}:${sourceKey}:${keys.thumbStorageKey}:${keys.mediumStorageKey}`;
  const existing = jobs.get(identity);
  if (existing) return existing;
  const job = prepare().finally(() => jobs!.delete(identity));
  jobs.set(identity, job);
  return job;

  async function prepare() {
    const [thumbExists, mediumExists] = await Promise.all([
      storage.objectExists(bucket, keys.thumbStorageKey), storage.objectExists(bucket, keys.mediumStorageKey),
    ]);
    if (thumbExists && mediumExists) return keys;
    let buffer = source;
    if (!buffer) {
      const stream = await storage.openDownload(bucket, sourceKey);
      const parts: Buffer[] = []; let length = 0;
      try {
        for await (const part of stream) {
          const chunk = Buffer.isBuffer(part) ? part : Buffer.from(part);
          length += chunk.length;
          if (length > 32 * 1024 * 1024) throw new Error('Cover image is too large');
          parts.push(chunk);
        }
      } finally { stream.destroy(); }
      buffer = Buffer.concat(parts);
    }
    if (buffer.length > 32 * 1024 * 1024) throw new Error('Cover image is too large');
    const jobs: Array<Promise<unknown>> = [];
    // Never overwrite the original or add generated files to the gallery.
    if (!thumbExists) jobs.push(sharp(buffer, { limitInputPixels: 40000000 }).rotate().resize(320, 320, { fit: 'cover' }).webp({ quality: 78 }).toBuffer()
      .then(body => storage.uploadObject({ bucket, key: keys.thumbStorageKey, body, contentType: 'image/webp' })));
    if (!mediumExists) jobs.push(sharp(buffer, { limitInputPixels: 40000000 }).rotate().resize(900, 900, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 84 }).toBuffer()
      .then(body => storage.uploadObject({ bucket, key: keys.mediumStorageKey, body, contentType: 'image/webp' })));
    await Promise.all(jobs);
    return keys;
  }
}
