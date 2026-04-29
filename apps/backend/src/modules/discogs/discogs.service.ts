import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ImageType, UserRole } from '@prisma/client';
import sharp from 'sharp';
import { request } from 'undici';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { SyncDiscogsDto } from './dto/sync-discogs.dto';

type DiscogsRelease = {
  id: number;
  title: string;
  year?: number;
  country?: string;
  thumb?: string;
  cover_image?: string;
  genres?: string[];
  styles?: string[];
  artists?: Array<{ name: string }>;
  images?: Array<{ type: string; uri?: string; uri150?: string }>;
  tracklist?: Array<{
    position: string;
    title: string;
    duration: string;
    type_: string;
    artists?: Array<{ name: string; anv?: string }>;
  }>;
};

type StoredCoverSet = {
  storageKey: string;
  url: string | null;
  thumbStorageKey: string;
  thumbUrl: string | null;
  mediumStorageKey: string;
  mediumUrl: string | null;
};

@Injectable()
export class DiscogsService {
  private readonly logger = new Logger(DiscogsService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
  ) {}

  async syncDiscogsCollection(dto: SyncDiscogsDto) {
    const username = dto.username || this.configService.get<string>('DISCOGS_USERNAME');
    if (!username) {
      throw new Error('Discogs username is not configured');
    }

    const userId = dto.userId || 'default-user';
    await this.ensureDefaultUser(userId, username);

    const collection = await this.fetchDiscogsCollection(username);
    const syncedReleases: string[] = [];

    for (const item of collection) {
      try {
        const fullRelease = await this.fetchDiscogsReleaseDetails(item.basic_information.id);
        const source = this.mergeDiscogsRelease(item.basic_information, fullRelease);
        const release = await this.upsertReleaseFromDiscogs(source);
        await this.syncReleaseTracks(release.id, source.tracklist || []);
        await this.prisma.collectionItem.upsert({
          where: {
            userId_releaseId: {
              userId,
              releaseId: release.id,
            },
          },
          create: {
            userId,
            releaseId: release.id,
            discogsItemId: String(item.id),
            addedAt: new Date(item.date_added),
          },
          update: {
            discogsItemId: String(item.id),
            addedAt: new Date(item.date_added),
          },
        });
        syncedReleases.push(release.id);
      } catch (error) {
        this.logger.warn(
          `Failed to sync Discogs release ${item.basic_information.id}: ${this.getErrorMessage(error)}`,
        );
        continue;
      }
    }

    return {
      synced: syncedReleases.length,
      releaseIds: syncedReleases,
    };
  }

  async backfillCoverStorage() {
    const releases = await this.prisma.release.findMany({
      where: {
        coverImageUrl: {
          not: null,
        },
        OR: [
          { coverStorageKey: null },
          { coverThumbStorageKey: null },
          { coverMediumStorageKey: null },
        ],
      },
      select: {
        id: true,
        discogsReleaseId: true,
        title: true,
        coverImageUrl: true,
        coverStorageKey: true,
        coverStorageUrl: true,
        coverThumbStorageKey: true,
        coverThumbStorageUrl: true,
        coverMediumStorageKey: true,
        coverMediumStorageUrl: true,
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    const failed: Array<{ discogsReleaseId: number; title: string }> = [];
    let uploaded = 0;

    for (const release of releases) {
      const stored = await this.storeCoverForRelease(release, release.coverImageUrl);
      if (stored) {
        uploaded += 1;
        continue;
      }

      failed.push({
        discogsReleaseId: release.discogsReleaseId,
        title: release.title,
      });
    }

    return {
      scanned: releases.length,
      uploaded,
      failed: failed.length,
      failures: failed.slice(0, 10),
    };
  }

  async hydrateReleaseFromDiscogs(releaseId: string) {
    const existing = await this.prisma.release.findUnique({
      where: { id: releaseId },
    });

    if (!existing) {
      return null;
    }

    const username = this.configService.get<string>('DISCOGS_USERNAME');
    const basicInformation = username
      ? await this.fetchCollectionReleaseBasicInformation(username, existing.discogsReleaseId)
      : null;
    const fullRelease = await this.fetchDiscogsReleaseDetails(existing.discogsReleaseId);
    const source = this.mergeDiscogsRelease(
      basicInformation || { id: existing.discogsReleaseId, title: existing.title },
      fullRelease,
    );

    if (!source) {
      return existing;
    }

    const release = await this.upsertReleaseFromDiscogs(source);
    await this.syncReleaseTracks(release.id, source.tracklist || []);
    return release;
  }

  async upsertReleaseFromDiscogs(release: DiscogsRelease) {
    const artist = release.artists?.map((item) => item.name).join(', ') || 'Unknown Artist';
    const existingRelease = await this.prisma.release.findUnique({
      where: {
        discogsReleaseId: release.id,
      },
      select: {
        id: true,
        coverImageUrl: true,
        coverStorageKey: true,
        coverStorageUrl: true,
        coverThumbStorageKey: true,
        coverThumbStorageUrl: true,
        coverMediumStorageKey: true,
        coverMediumStorageUrl: true,
      },
    });
    const primaryImage = this.getPrimaryImageUrl(release);

    const savedRelease = await this.prisma.release.upsert({
      where: {
        discogsReleaseId: release.id,
      },
      create: {
        discogsReleaseId: release.id,
        artist,
        title: release.title,
        year: release.year,
        country: release.country,
        genres: release.genres || [],
        styles: release.styles || [],
        coverImageUrl: primaryImage,
      },
      update: {
        artist,
        title: release.title,
        year: release.year,
        country: release.country,
        genres: release.genres || [],
        styles: release.styles || [],
        coverImageUrl: primaryImage,
      },
    });

    await this.storeCoverForRelease(savedRelease, primaryImage, {
      force: Boolean(primaryImage && existingRelease?.coverImageUrl !== primaryImage),
    });
    await this.syncGalleryImagesForRelease(savedRelease.id, release);

    return savedRelease;
  }

  async syncReleaseTracks(
    releaseId: string,
    tracklist: Array<{
      position: string;
      title: string;
      duration: string;
      type_?: string;
      artists?: Array<{ name: string; anv?: string }>;
    }>,
  ) {
    for (const track of tracklist.filter((item) => item.type_ !== 'heading')) {
      const artists = this.getTrackArtists(track);
      const durationRaw = track.duration || null;
      const durationSec = this.parseDuration(track.duration);
      const durationData =
        durationRaw || durationSec
          ? {
              durationRaw,
              durationSec,
            }
          : {};

      await this.prisma.track.upsert({
        where: {
          releaseId_position_title: {
            releaseId,
            position: track.position || '',
            title: track.title,
          },
        },
        create: {
          releaseId,
          position: track.position || '',
          title: track.title,
          ...durationData,
          artists,
        },
        update: {
          ...durationData,
          artists,
        },
      });
    }
  }

  async downloadAndUploadCoverToS3(discogsReleaseId: number, imageUrl: string, key?: string) {
    try {
      const response = await request(imageUrl, {
        headers: {
          'User-Agent': 'vinyl-collection-mvp/0.1',
        },
      });
      const arrayBuffer = await response.body.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const bucket = this.configService.get<string>('SELECTEL_S3_BUCKET_COVERS') || 'covers';
      const storageKey = key || this.storageService.getCoverKey(discogsReleaseId);
      const url = await this.storageService.uploadObject({
        bucket,
        key: storageKey,
        body: buffer,
        contentType: String(response.headers['content-type'] || 'image/jpeg'),
      });

      return {
        storageKey,
        url,
      };
    } catch (error) {
      this.logger.warn(
        `Failed to store cover ${discogsReleaseId} in S3: ${this.getErrorMessage(error)}`,
      );
      return null;
    }
  }

  async downloadAndUploadCoverSetToS3(
    discogsReleaseId: number,
    imageUrl: string,
  ): Promise<StoredCoverSet | null> {
    try {
      const response = await request(imageUrl, {
        headers: {
          'User-Agent': 'vinyl-collection-mvp/0.1',
        },
      });
      const arrayBuffer = await response.body.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const bucket = this.configService.get<string>('SELECTEL_S3_BUCKET_COVERS') || 'covers';
      const storageKey = this.storageService.getCoverKey(discogsReleaseId);
      const thumbStorageKey = this.storageService.getCoverThumbKey(discogsReleaseId);
      const mediumStorageKey = this.storageService.getCoverMediumKey(discogsReleaseId);
      const sourceContentType = String(response.headers['content-type'] || 'image/jpeg');
      const [thumbBuffer, mediumBuffer] = await Promise.all([
        sharp(buffer)
          .rotate()
          .resize(320, 320, { fit: 'cover' })
          .webp({ quality: 78 })
          .toBuffer(),
        sharp(buffer)
          .rotate()
          .resize(900, 900, { fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 84 })
          .toBuffer(),
      ]);

      const [url, thumbUrl, mediumUrl] = await Promise.all([
        this.storageService.uploadObject({
          bucket,
          key: storageKey,
          body: buffer,
          contentType: sourceContentType,
        }),
        this.storageService.uploadObject({
          bucket,
          key: thumbStorageKey,
          body: thumbBuffer,
          contentType: 'image/webp',
        }),
        this.storageService.uploadObject({
          bucket,
          key: mediumStorageKey,
          body: mediumBuffer,
          contentType: 'image/webp',
        }),
      ]);

      return {
        storageKey,
        url,
        thumbStorageKey,
        thumbUrl,
        mediumStorageKey,
        mediumUrl,
      };
    } catch (error) {
      this.logger.warn(
        `Failed to store cover variants ${discogsReleaseId} in S3: ${this.getErrorMessage(error)}`,
      );
      return null;
    }
  }

  private async storeCoverForRelease(
    release: {
      id: string;
      discogsReleaseId: number;
      coverImageUrl?: string | null;
      coverStorageKey?: string | null;
      coverStorageUrl?: string | null;
      coverThumbStorageKey?: string | null;
      coverThumbStorageUrl?: string | null;
      coverMediumStorageKey?: string | null;
      coverMediumStorageUrl?: string | null;
    },
    imageUrl?: string | null,
    options?: {
      force?: boolean;
    },
  ) {
    if (!imageUrl) {
      return null;
    }

    if (
      !options?.force &&
      release.coverStorageKey &&
      release.coverStorageUrl &&
      release.coverThumbStorageKey &&
      release.coverThumbStorageUrl &&
      release.coverMediumStorageKey &&
      release.coverMediumStorageUrl
    ) {
      return {
        storageKey: release.coverStorageKey,
        url: release.coverStorageUrl,
        thumbStorageKey: release.coverThumbStorageKey,
        thumbUrl: release.coverThumbStorageUrl,
        mediumStorageKey: release.coverMediumStorageKey,
        mediumUrl: release.coverMediumStorageUrl,
      };
    }

    const uploaded = await this.downloadAndUploadCoverSetToS3(release.discogsReleaseId, imageUrl);
    if (!uploaded) {
      return null;
    }

    await this.prisma.release.update({
      where: { id: release.id },
      data: {
        coverStorageKey: uploaded.storageKey,
        coverStorageUrl: uploaded.url,
        coverThumbStorageKey: uploaded.thumbStorageKey,
        coverThumbStorageUrl: uploaded.thumbUrl,
        coverMediumStorageKey: uploaded.mediumStorageKey,
        coverMediumStorageUrl: uploaded.mediumUrl,
      },
    });

    if (uploaded.url) {
      await this.prisma.image.upsert({
        where: {
          storageKey: uploaded.storageKey,
        },
        create: {
          releaseId: release.id,
          type: ImageType.COVER,
          url: uploaded.url,
          storageKey: uploaded.storageKey,
        },
        update: {
          url: uploaded.url,
        },
      });
    }

    return uploaded;
  }

  private async syncGalleryImagesForRelease(
    releaseId: string,
    discogsRelease: DiscogsRelease,
  ) {
    const galleryImages = (discogsRelease.images || [])
      .filter((image) => image.type !== 'primary')
      .map((image) => image.uri || image.uri150)
      .filter((url): url is string => Boolean(url));

    const keepStorageKeys: string[] = [];

    for (const [index, imageUrl] of galleryImages.entries()) {
      const storageKey = this.storageService.getReleaseImageKey(discogsRelease.id, index + 1);
      const uploaded = await this.downloadAndUploadCoverToS3(
        discogsRelease.id,
        imageUrl,
        storageKey,
      );

      if (!uploaded?.url) {
        continue;
      }

      keepStorageKeys.push(uploaded.storageKey);
      await this.prisma.image.upsert({
        where: {
          storageKey: uploaded.storageKey,
        },
        create: {
          releaseId,
          type: ImageType.GALLERY,
          url: uploaded.url,
          storageKey: uploaded.storageKey,
        },
        update: {
          url: uploaded.url,
          type: ImageType.GALLERY,
        },
      });
    }

    await this.prisma.image.deleteMany({
      where: {
        releaseId,
        type: ImageType.GALLERY,
        ...(keepStorageKeys.length ? { storageKey: { notIn: keepStorageKeys } } : {}),
      },
    });
  }

  private getPrimaryImageUrl(release: DiscogsRelease) {
    const primaryImage = release.images?.find((image) => image.type === 'primary');

    return primaryImage?.uri || release.cover_image || primaryImage?.uri150 || release.thumb || null;
  }

  private async fetchDiscogsCollection(username: string) {
    const baseUrl = this.configService.get<string>('DISCOGS_API_BASE_URL') || 'https://api.discogs.com';
    const releases: Array<{
      id: number;
      date_added: string;
      basic_information: DiscogsRelease;
    }> = [];

    let page = 1;
    let totalPages = 1;

    do {
      const json = await this.fetchDiscogsJson<{
        pagination?: {
          page?: number;
          pages?: number;
        };
        releases?: Array<{
          id: number;
          date_added: string;
          basic_information: DiscogsRelease;
        }>;
      }>(`${baseUrl}/users/${username}/collection/folders/0/releases?per_page=100&page=${page}`);

      if (!json) {
        break;
      }

      releases.push(...(json.releases || []));
      totalPages = json.pagination?.pages || page;
      page += 1;
    } while (page <= totalPages);

    return releases;
  }

  private async fetchDiscogsReleaseDetails(releaseId: number) {
    const baseUrl = this.configService.get<string>('DISCOGS_API_BASE_URL') || 'https://api.discogs.com';
    return this.fetchDiscogsJson<DiscogsRelease>(`${baseUrl}/releases/${releaseId}`);
  }

  private async fetchCollectionReleaseBasicInformation(username: string, releaseId: number) {
    const baseUrl = this.configService.get<string>('DISCOGS_API_BASE_URL') || 'https://api.discogs.com';
    let page = 1;
    let totalPages = 1;

    do {
      const json = await this.fetchDiscogsJson<{
        pagination?: {
          pages?: number;
        };
        releases?: Array<{
          basic_information: DiscogsRelease;
        }>;
      }>(`${baseUrl}/users/${username}/collection/folders/0/releases?per_page=100&page=${page}`);

      if (!json) {
        return null;
      }

      const match = json.releases?.find((item) => item.basic_information.id === releaseId);
      if (match) {
        return match.basic_information;
      }

      totalPages = json.pagination?.pages || page;
      page += 1;
    } while (page <= totalPages);

    return null;
  }

  private mergeDiscogsRelease(
    basicInformation: DiscogsRelease,
    fullRelease: DiscogsRelease | null,
  ): DiscogsRelease {
    if (!fullRelease) {
      return basicInformation;
    }

    return {
      ...basicInformation,
      ...fullRelease,
      thumb: fullRelease.thumb || basicInformation.thumb,
      cover_image: fullRelease.cover_image || basicInformation.cover_image || basicInformation.thumb,
      genres: fullRelease.genres?.length ? fullRelease.genres : basicInformation.genres,
      styles: fullRelease.styles?.length ? fullRelease.styles : basicInformation.styles,
      artists: fullRelease.artists?.length ? fullRelease.artists : basicInformation.artists,
      images: fullRelease.images?.length ? fullRelease.images : basicInformation.images,
      tracklist: fullRelease.tracklist?.length ? fullRelease.tracklist : basicInformation.tracklist,
    };
  }

  private getDiscogsHeaders() {
    const token = this.configService.get<string>('DISCOGS_USER_TOKEN');

    return {
      ...(token ? { Authorization: `Discogs token=${token}` } : {}),
      'User-Agent': 'vinyl-collection-mvp/0.1',
    };
  }

  private parseDuration(duration?: string) {
    if (!duration || !duration.includes(':')) {
      return null;
    }

    const [minutes, seconds] = duration.split(':').map(Number);
    if (Number.isNaN(minutes) || Number.isNaN(seconds)) {
      return null;
    }

    return minutes * 60 + seconds;
  }

  private getTrackArtists(track: { artists?: Array<{ name: string; anv?: string }> }) {
    return (
      track.artists
        ?.map((artist) => artist.anv || artist.name)
        .map((name) => name.replace(/\s+\(\d+\)$/, '').trim())
        .filter(Boolean) || []
    );
  }

  private async fetchDiscogsJson<T>(url: string, retries = 3): Promise<T | null> {
    for (let attempt = 1; attempt <= retries; attempt += 1) {
      try {
        const response = await request(url, {
          headers: this.getDiscogsHeaders(),
        });

        const text = await response.body.text();
        if (response.statusCode >= 400 || !text) {
          throw new Error(`Discogs request failed with status ${response.statusCode}`);
        }

        return JSON.parse(text) as T;
      } catch {
        if (attempt < retries) {
          await this.delay(attempt * 500);
        }
      }
    }

    return null;
  }

  private async delay(ms: number) {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private getErrorMessage(error: unknown) {
    if (error instanceof Error) {
      return error.message;
    }

    return 'Unknown error';
  }

  private async ensureDefaultUser(userId: string, username: string) {
    await this.prisma.user.upsert({
      where: {
        id: userId,
      },
      create: {
        id: userId,
        displayName: 'Моя коллекция',
        discogsUsername: username,
        role: UserRole.ADMIN,
      },
      update: {
        discogsUsername: username,
      },
    });
  }
}
