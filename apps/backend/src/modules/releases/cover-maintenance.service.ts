import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';

type Mode = 'check' | 'convert';
type Version = { id: string; updatedAt: Date };
type Reference = { version: Version; model: 'release' | 'image'; id: string; field: string; urlField?: string };
type Target = { key: string; references: Reference[] };
export type CoverMaintenanceStatus = {
  id: string | null; mode: Mode; status: 'idle' | 'running' | 'completed' | 'failed';
  total: number; processed: number; webp: number; other: number; converted: number;
  skipped: number; failed: number; stale: number; withoutStorageKey: number;
  bytesBefore: number; bytesAfter: number; formats: Record<string, number>;
  errors: Array<{ key: string; message: string }>; startedAt?: string; finishedAt?: string;
};

const idle = (): CoverMaintenanceStatus => ({
  id: null, mode: 'check', status: 'idle', total: 0, processed: 0, webp: 0, other: 0,
  converted: 0, skipped: 0, failed: 0, stale: 0, withoutStorageKey: 0,
  bytesBefore: 0, bytesAfter: 0, formats: {}, errors: [],
});

@Injectable()
export class CoverMaintenanceService {
  private state = idle();
  constructor(private readonly prisma: PrismaService, private readonly storage: StorageService, private readonly config: ConfigService) {}

  status(): CoverMaintenanceStatus {
    return { ...this.state, formats: { ...this.state.formats }, errors: this.state.errors.map(error => ({ ...error })) };
  }

  start(mode: Mode) {
    if (this.state.status === 'running') return this.status();
    this.state = { ...idle(), id: randomUUID(), mode, status: 'running', startedAt: new Date().toISOString() };
    void this.run(mode).catch(() => {
      this.state.status = 'failed';
      this.state.finishedAt = new Date().toISOString();
      this.state.errors.push({ key: '', message: 'Unable to read the cover catalog' });
    });
    return this.status();
  }

  private async targets() {
    const releases = await this.prisma.release.findMany({ orderBy: { id: 'asc' }, select: {
      id: true, updatedAt: true, coverImageUrl: true,
      coverStorageKey: true, coverThumbStorageKey: true, coverMediumStorageKey: true,
      images: { select: { id: true, storageKey: true, thumbStorageKey: true, mediumStorageKey: true } },
    } });
    const targets = new Map<string, Target>();
    const add = (key: string | null, reference: Reference) => {
      if (!key) return;
      const entry = targets.get(key) || { key, references: [] };
      entry.references.push(reference);
      targets.set(key, entry);
    };
    for (const release of releases) {
      const version = { id: release.id, updatedAt: release.updatedAt };
      if (!release.coverStorageKey && release.coverImageUrl) this.state.withoutStorageKey++;
      add(release.coverStorageKey, { version, model: 'release', id: release.id, field: 'coverStorageKey', urlField: 'coverStorageUrl' });
      add(release.coverThumbStorageKey, { version, model: 'release', id: release.id, field: 'coverThumbStorageKey', urlField: 'coverThumbStorageUrl' });
      add(release.coverMediumStorageKey, { version, model: 'release', id: release.id, field: 'coverMediumStorageKey', urlField: 'coverMediumStorageUrl' });
      for (const image of release.images) {
        add(image.storageKey, { version, model: 'image', id: image.id, field: 'storageKey', urlField: 'url' });
        add(image.thumbStorageKey, { version, model: 'image', id: image.id, field: 'thumbStorageKey' });
        add(image.mediumStorageKey, { version, model: 'image', id: image.id, field: 'mediumStorageKey' });
      }
    }
    return [...targets.values()];
  }

  private async read(bucket: string, key: string) {
    const stream = await this.storage.openDownload(bucket, key);
    const chunks: Buffer[] = [];
    let size = 0;
    try {
      for await (const part of stream) {
        const chunk = Buffer.isBuffer(part) ? part : Buffer.from(part);
        size += chunk.length;
        if (size > 32 * 1024 * 1024) throw new Error('Image exceeds 32 MiB');
        chunks.push(chunk);
      }
    } finally { stream.destroy(); }
    return Buffer.concat(chunks);
  }

  private async replaceReferences(target: Target, key: string, url: string) {
    const versions = [...new Set(target.references.map(ref => ref.version))];
    const committed = await this.prisma.$transaction(async tx => {
      const changes: Array<{ version: Version; updatedAt: Date; count: number }> = [];
      for (const version of versions) {
        // Reserve the release version before changing any of its gallery refs.
        // A concurrent editor or Discogs sync always wins over this snapshot.
        const updatedAt = new Date(Math.max(Date.now(), version.updatedAt.getTime() + 1));
        const locked = await tx.release.updateMany({ where: { id: version.id, updatedAt: version.updatedAt }, data: { updatedAt } });
        if (!locked.count) continue;
        let count = 0;
        for (const ref of target.references.filter(item => item.version === version)) {
          const where = { id: ref.id, [ref.field]: target.key };
          const data = { [ref.field]: key, ...(ref.urlField ? { [ref.urlField]: url } : {}) };
          const result = ref.model === 'release'
            ? await tx.release.updateMany({ where, data })
            : await tx.image.updateMany({ where, data });
          count += result.count;
        }
        changes.push({ version, updatedAt, count });
      }
      return changes;
    });
    // Only advance our snapshot after the entire transaction has committed.
    for (const change of committed) change.version.updatedAt = change.updatedAt;
    return committed.reduce((sum, change) => sum + change.count, 0);
  }

  private async run(mode: Mode) {
    const bucket = this.config.get<string>('SELECTEL_S3_BUCKET_COVERS') || 'covers';
    const targets = await this.targets();
    this.state.total = targets.length;
    for (const target of targets) {
      let originalBytes = 0;
      try {
        if (!target.key.startsWith('covers/') || /[\\\0]/.test(target.key) || target.key.split('/').some(part => part === '..' || part === '.')) {
          throw new Error('Invalid cover key');
        }
        const source = await this.read(bucket, target.key);
        const metadata = await sharp(source, { limitInputPixels: 40000000 }).metadata();
        if (!metadata.format) throw new Error('Unrecognized image format');
        this.state.formats[metadata.format] = (this.state.formats[metadata.format] || 0) + 1;
        this.state.bytesBefore += source.length;
        originalBytes = source.length;
        if (metadata.format === 'webp') this.state.webp++;
        else this.state.other++;
        if (mode === 'check' || metadata.format === 'webp') {
          this.state.bytesAfter += source.length;
          continue;
        }
        if ((metadata.pages || 1) > 1 || !['jpeg', 'png', 'avif', 'heif', 'tiff'].includes(metadata.format)) {
          this.state.skipped++; this.state.bytesAfter += source.length;
          continue;
        }
        const output = await sharp(source, { limitInputPixels: 40000000 }).rotate().webp({ quality: 90, effort: 5 }).toBuffer();
        if (output.length >= source.length) {
          this.state.skipped++; this.state.bytesAfter += source.length;
          continue;
        }
        const hash = createHash('sha256').update(target.key).update(source).digest('hex');
        const key = `covers/webp/v1/${hash}/image.webp`;
        const manifestKey = `covers/webp/v1/${hash}/source.json`;
        if (!await this.storage.objectExists(bucket, key)) {
          await this.storage.uploadObject({ bucket, key, body: output, contentType: 'image/webp' });
        }
        // Keep the original object and a durable map back to it; no gallery rows
        // are added and no A/B/C/D assignment flags are touched.
        await this.storage.uploadObject({ bucket, key: manifestKey, contentType: 'application/json', body: Buffer.from(JSON.stringify({
          sourceKey: target.key, convertedKey: key, quality: 90, width: metadata.width, height: metadata.height,
          references: target.references.map(ref => ({ model: ref.model, id: ref.id, field: ref.field })),
        })) });
        const url = await this.storage.getSignedObjectUrl(bucket, key);
        if (!url) throw new Error('Converted image URL unavailable');
        const changed = await this.replaceReferences(target, key, url);
        if (changed) {
          this.state.converted++; this.state.bytesAfter += output.length;
        } else {
          this.state.stale++; this.state.bytesAfter += source.length;
        }
      } catch (error) {
        this.state.bytesAfter += originalBytes;
        this.state.failed++;
        if (this.state.errors.length < 50) this.state.errors.push({ key: target.key, message: error instanceof Error ? error.name : 'Image processing error' });
      } finally {
        this.state.processed++;
      }
      // Yield between files instead of issuing hundreds of S3/CPU jobs at once.
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    this.state.status = 'completed';
    this.state.finishedAt = new Date().toISOString();
  }
}
