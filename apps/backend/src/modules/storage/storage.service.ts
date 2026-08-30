import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sanitizeFilename from 'sanitize-filename';

@Injectable()
export class StorageService {
  private readonly client: S3Client | null;
  private readonly endpoint: string | null;
  private readonly signedUrlCache = new Map<string, { url: string; expiresAt: number }>();

  constructor(private readonly configService: ConfigService) {
    const endpoint = this.normalizeEndpoint(this.configService.get<string>('SELECTEL_S3_ENDPOINT'));
    const accessKeyId = this.configService.get<string>('SELECTEL_S3_ACCESS_KEY');
    const secretAccessKey = this.configService.get<string>('SELECTEL_S3_SECRET_KEY');
    const region = this.configService.get<string>('SELECTEL_S3_REGION') || 'ru-1';
    this.endpoint = endpoint;

    if (!endpoint || !accessKeyId || !secretAccessKey) {
      this.client = null;
      return;
    }

    this.client = new S3Client({
      endpoint,
      region,
      forcePathStyle: true,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
  }

  getCoverKey(discogsReleaseId: number) {
    return `covers/${discogsReleaseId}/front.jpg`;
  }

  getCoverThumbKey(discogsReleaseId: number) {
    return `covers/${discogsReleaseId}/thumb.webp`;
  }

  getCoverMediumKey(discogsReleaseId: number) {
    return `covers/${discogsReleaseId}/medium.webp`;
  }

  getReleaseImageKey(discogsReleaseId: number, imageIndex: number) {
    return `covers/${discogsReleaseId}/gallery-${imageIndex}.jpg`;
  }

  getAudioKey(input: {
    userId: string;
    releaseId: string;
    trackId: string;
    fileName: string;
  }) {
    const safeName = sanitizeFilename(input.fileName).replace(/\s+/g, '-').toLowerCase();
    return `audio/${input.userId}/${input.releaseId}/${input.trackId}/${safeName}`;
  }

  getAvatarKey(userId: string, version = Date.now()) {
    return `avatars/${userId}/avatar-${version}.webp`;
  }

  async uploadObject(params: {
    bucket: string;
    key: string;
    body: Buffer;
    contentType: string;
  }) {
    if (this.isLocalBucket(params.bucket)) {
      const filePath = this.resolveLocalObjectPath(params.bucket, params.key);
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, params.body);
      return this.buildLocalObjectUrl(params.bucket, params.key);
    }

    if (!this.client) {
      throw new Error('S3 client is not configured');
    }

    await this.client.send(
      new PutObjectCommand({
        Bucket: params.bucket,
        Key: params.key,
        Body: params.body,
        ContentType: params.contentType,
      }),
    );

    return this.buildObjectUrl(params.bucket, params.key);
  }

  async deleteObject(bucket: string, key: string) {
    if (this.isLocalBucket(bucket)) {
      await rm(this.resolveLocalObjectPath(bucket, key), { force: true });
      return;
    }

    if (!this.client) {
      throw new Error('S3 client is not configured');
    }

    await this.client.send(
      new DeleteObjectCommand({
        Bucket: bucket,
        Key: key,
      }),
    );
  }

  async getSignedObjectUrl(bucket: string, key: string, expiresIn = 3600) {
    if (this.isLocalBucket(bucket)) {
      try {
        await stat(this.resolveLocalObjectPath(bucket, key));
        return this.buildLocalObjectUrl(bucket, key);
      } catch {
        return null;
      }
    }

    if (!this.client) {
      return null;
    }

    const cacheKey = `${bucket}:${key}:${expiresIn}`;
    const now = Date.now();
    const cachedUrl = this.signedUrlCache.get(cacheKey);

    if (cachedUrl && cachedUrl.expiresAt > now + 60_000) {
      return cachedUrl.url;
    }

    const url = await getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      }),
      { expiresIn },
    );

    this.signedUrlCache.set(cacheKey, {
      url,
      expiresAt: now + expiresIn * 1000,
    });

    return url;
  }

  buildObjectUrl(bucket: string, key: string) {
    if (this.isLocalBucket(bucket)) {
      return this.buildLocalObjectUrl(bucket, key);
    }

    if (!this.endpoint) {
      return null;
    }

    return `${this.endpoint.replace(/\/$/, '')}/${bucket}/${key}`;
  }

  private normalizeEndpoint(endpoint?: string | null) {
    if (!endpoint) {
      return null;
    }

    if (/^https?:\/\//i.test(endpoint)) {
      return endpoint;
    }

    return `https://${endpoint}`;
  }

  isLocalBucket(bucket: string) {
    const driver =
      this.configService.get<string>('STORAGE_DRIVER') ||
      this.configService.get<string>('AUDIO_STORAGE_DRIVER') ||
      'local';
    const localBuckets = new Set([
      this.configService.get<string>('SELECTEL_S3_BUCKET_AUDIO') || 'audio',
      this.configService.get<string>('SELECTEL_S3_BUCKET_COVERS') || 'covers',
      this.configService.get<string>('SELECTEL_S3_BUCKET_AVATARS') || 'avatars',
    ]);
    return driver.toLowerCase() === 'local' && localBuckets.has(bucket);
  }

  resolveLocalObjectPath(bucket: string, key: string) {
    if (!this.isLocalBucket(bucket)) {
      throw new Error('This bucket is not configured for local storage');
    }

    const root = path.resolve(
      this.configService.get<string>('LOCAL_STORAGE_PATH') || '/data/storage',
    );
    const filePath = path.resolve(root, key);
    const allowedPrefix = `${root}${path.sep}`;

    if (!filePath.startsWith(allowedPrefix)) {
      throw new Error('Invalid local storage key');
    }

    return filePath;
  }

  private buildLocalObjectUrl(bucket: string, key: string) {
    const publicBase = (
      this.configService.get<string>('BACKEND_PUBLIC_URL') || 'http://localhost:3001'
    ).replace(/\/$/, '');
    const encodedPath = [bucket, ...key.split('/')]
      .map((part) => encodeURIComponent(part))
      .join('/');
    return `${publicBase}/api/media/${encodedPath}`;
  }
}
