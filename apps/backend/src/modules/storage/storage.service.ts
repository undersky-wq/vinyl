import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import sanitizeFilename from 'sanitize-filename';

@Injectable()
export class StorageService {
  private readonly client: S3Client | null;
  private readonly endpoint: string | null;

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
    if (!this.client) {
      return null;
    }

    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      }),
      { expiresIn },
    );
  }

  buildObjectUrl(bucket: string, key: string) {
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
}
