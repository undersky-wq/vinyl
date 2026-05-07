import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ImageType, Prisma, User } from '@prisma/client';
import sanitizeFilename from 'sanitize-filename';
import sharp from 'sharp';
import { AudioService } from '../audio/audio.service';
import { DiscogsService } from '../discogs/discogs.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { CreateManualReleaseDto, ManualTrackInput } from './dto/create-manual-release.dto';
import { QueryReleasesDto } from './dto/query-releases.dto';
import { UpdateTrackMetadataDto } from './dto/update-track-metadata.dto';

@Injectable()
export class ReleasesService {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly discogsService: DiscogsService,
    private readonly storageService: StorageService,
    private readonly audioService: AudioService,
  ) {}

  async createManualRelease(
    user: User,
    body: CreateManualReleaseDto,
    files: Array<Express.Multer.File>,
  ) {
    const tracks = this.parseManualTracks(body.tracks);
    const styles = this.splitList(body.styles);
    const year: number | null = body.year ? Number(body.year) : null;

    if (year !== null && (!Number.isInteger(year) || year < 1900 || year > 2100)) {
      throw new BadRequestException('Invalid release year');
    }

    const discogsReleaseId = await this.getNextManualDiscogsId();
    const coverFile = files.find((file) => file.fieldname === 'cover') || null;
    const audioFilesByTrackIndex = new Map<number, Express.Multer.File>();
    const collectionUserIds = [...new Set(['default-user', user.id])];

    await this.prisma.user.upsert({
      where: { id: 'default-user' },
      create: {
        id: 'default-user',
        displayName: 'Моя коллекция',
      },
      update: {},
    });

    for (const file of files) {
      const match = file.fieldname.match(/^audio-(\d+)$/);
      if (match) {
        audioFilesByTrackIndex.set(Number(match[1]), file);
      }
    }

    const createdRelease = await this.prisma.release.create({
      data: {
        discogsReleaseId,
        artist: body.artist.trim(),
        title: body.title.trim(),
        year,
        country: body.country?.trim() || null,
        genres: [],
        styles,
        collectionItems: {
          create: collectionUserIds.map((userId) => ({ userId })),
        },
        tracks: {
          create: tracks.map((track, index) => ({
            position: track.position?.trim() || `${index + 1}`,
            title: track.title.trim(),
            artists: track.artist?.trim() ? [track.artist.trim()] : [],
            bpm: this.parseOptionalBpm(track.bpm),
            key: track.key?.trim() || null,
          })),
        },
      },
      include: {
        tracks: {
          orderBy: {
            position: 'asc',
          },
        },
      },
    });

    if (coverFile) {
      await this.uploadManualCover(createdRelease.id, coverFile);
    }

    for (let index = 0; index < createdRelease.tracks.length; index += 1) {
      const file = audioFilesByTrackIndex.get(index);
      if (!file) {
        continue;
      }

      await this.audioService.uploadAudio(file, {
        trackId: createdRelease.tracks[index].id,
        userId: user.id,
      });
    }

    return this.findOne(createdRelease.id, true);
  }

  async findAll(query: QueryReleasesDto, includeAudioUrls = false) {
    const userId = query.userId || 'default-user';
    const summaryOnly = query.summary === 'true';
    const take = query.limit ? Math.min(Math.max(Number(query.limit), 1), 48) : undefined;
    const skip = query.offset ? Math.max(Number(query.offset), 0) : undefined;
    const genres = query.genre
      ? query.genre
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean)
      : [];
    const styles = query.style
      ? query.style
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean)
      : [];
    const where: Prisma.ReleaseWhereInput = {
      collectionItems: {
        some: {
          userId,
        },
      },
      ...(genres.length ? { genres: { hasSome: genres } } : {}),
      ...(styles.length ? { styles: { hasSome: styles } } : {}),
      ...(query.search
        ? {
            OR: [
              { artist: { contains: query.search, mode: 'insensitive' } },
              { title: { contains: query.search, mode: 'insensitive' } },
              {
                tracks: {
                  some: {
                    title: { contains: query.search, mode: 'insensitive' },
                  },
                },
              },
            ],
          }
        : {}),
      ...(query.hasAudio === 'true'
        ? {
            tracks: {
              some: {
                audioFiles: {
                  some: {},
                },
              },
            },
          }
        : {}),
      ...(query.bpm || query.key
        ? {
            tracks: {
              some: {
                ...(query.bpm ? { bpm: Number(query.bpm) } : {}),
                ...(query.key ? { key: query.key } : {}),
              },
            },
          }
        : {}),
    };

    const releases = summaryOnly
      ? await this.prisma.release.findMany({
          where,
          ...(typeof skip === 'number' ? { skip } : {}),
          ...(typeof take === 'number' ? { take } : {}),
          select: {
            id: true,
            artist: true,
            title: true,
            year: true,
            genres: true,
            styles: true,
            coverImageUrl: true,
            coverStorageKey: true,
            coverStorageUrl: true,
            coverThumbStorageKey: true,
            coverThumbStorageUrl: true,
            coverMediumStorageKey: true,
            coverMediumStorageUrl: true,
            tracks: {
              select: {
                id: true,
                title: true,
                audioFiles: true,
              },
            },
          },
          orderBy: {
            updatedAt: 'desc',
          },
        })
      : await this.prisma.release.findMany({
          where,
          ...(typeof skip === 'number' ? { skip } : {}),
          ...(typeof take === 'number' ? { take } : {}),
          include: {
            tracks: {
              include: {
                audioFiles: true,
              },
            },
            collectionItems: {
              where: {
                userId,
              },
            },
          },
          orderBy: {
            updatedAt: 'desc',
          },
        });

    return Promise.all(releases.map((release) => this.signReleaseUrls(release, includeAudioUrls)));
  }

  async findStyles(query: QueryReleasesDto) {
    const userId = query.userId || 'default-user';
    const releases = await this.prisma.release.findMany({
      where: {
        collectionItems: {
          some: {
            userId,
          },
        },
      },
      select: {
        styles: true,
      },
    });
    const counts = new Map<string, number>();

    for (const release of releases) {
      for (const style of release.styles) {
        if (!style.trim()) {
          continue;
        }

        counts.set(style, (counts.get(style) || 0) + 1);
      }
    }

    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([name, count]) => ({ name, count }));
  }

  async findSearchSuggestions(query: QueryReleasesDto) {
    const userId = query.userId || 'default-user';
    const search = query.search?.trim();

    if (!search || search.length < 2) {
      return [];
    }

    const releases = await this.prisma.release.findMany({
      where: {
        collectionItems: {
          some: {
            userId,
          },
        },
        OR: [
          { artist: { contains: search, mode: 'insensitive' } },
          { title: { contains: search, mode: 'insensitive' } },
          {
            tracks: {
              some: {
                OR: [
                  { title: { contains: search, mode: 'insensitive' } },
                  { artists: { has: search } },
                ],
              },
            },
          },
        ],
      },
      take: 16,
      include: {
        tracks: {
          where: {
            title: {
              contains: search,
              mode: 'insensitive',
            },
          },
          take: 3,
          orderBy: {
            position: 'asc',
          },
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    const suggestions = new Map<string, {
      id: string;
      label: string;
      meta: string;
      type: 'artist' | 'release' | 'track';
      search: string;
      releaseId?: string;
    }>();

    for (const release of releases) {
      if (release.artist.toLowerCase().includes(search.toLowerCase())) {
        suggestions.set(`artist:${release.artist}`, {
          id: `artist:${release.artist}`,
          label: release.artist,
          meta: 'Artist',
          type: 'artist',
          search: release.artist,
        });
      }

      if (release.title.toLowerCase().includes(search.toLowerCase())) {
        suggestions.set(`release:${release.id}`, {
          id: `release:${release.id}`,
          label: release.title,
          meta: release.year ? `${release.artist} • ${release.year}` : release.artist,
          type: 'release',
          search: release.title,
          releaseId: release.id,
        });
      }

      for (const track of release.tracks) {
        suggestions.set(`track:${track.id}`, {
          id: `track:${track.id}`,
          label: track.title,
          meta: `${track.artists.length ? track.artists.join(', ') : release.artist} • ${release.title}`,
          type: 'track',
          search: track.title,
          releaseId: release.id,
        });
      }
    }

    return [...suggestions.values()].slice(0, 8);
  }

  async findLibraryFeed(query: QueryReleasesDto) {
    const userId = query.userId || 'default-user';
    const take = query.limit ? Math.min(Math.max(Number(query.limit), 1), 60) : 40;
    const skip = query.offset ? Math.max(Number(query.offset), 0) : 0;
    const styles = this.splitList(query.style);
    const artist = query.artist?.trim();
    const key = query.key?.trim();

    const trackWhere: Prisma.TrackWhereInput = {
      audioFiles: {
        some: {},
      },
      ...(artist
        ? {
            OR: [
              {
                artists: {
                  has: artist,
                },
              },
              {
                release: {
                  artist,
                },
              },
            ],
          }
        : {}),
      ...(key ? { key } : {}),
    };
    const where: Prisma.ReleaseWhereInput = {
      collectionItems: {
        some: {
          userId,
        },
      },
      ...(styles.length ? { styles: { hasSome: styles } } : {}),
      tracks: {
        some: trackWhere,
      },
    };
    const [total, totalTracks, releases, optionsSource] = await Promise.all([
      this.prisma.release.count({ where }),
      this.prisma.track.count({
        where: {
          ...trackWhere,
          release: {
            is: where,
          },
        },
      }),
      this.prisma.release.findMany({
        where,
        skip,
        take,
        include: {
          tracks: {
            where: trackWhere,
            include: {
              audioFiles: true,
            },
            orderBy: {
              position: 'asc',
            },
          },
        },
        orderBy: {
          updatedAt: 'desc',
        },
      }),
      this.prisma.release.findMany({
        where: {
          collectionItems: {
            some: {
              userId,
            },
          },
          tracks: {
            some: {
              audioFiles: {
                some: {},
              },
            },
          },
        },
        select: {
          artist: true,
          styles: true,
          tracks: {
            where: {
              audioFiles: {
                some: {},
              },
            },
            select: {
              artists: true,
              key: true,
            },
          },
        },
      }),
    ]);

    const signedReleases = await Promise.all(
      releases.map((release) => this.signReleaseUrls(release, true)),
    );

    return {
      releases: signedReleases,
      total,
      totalTracks,
      hasMore: skip + signedReleases.length < total,
      options: this.buildLibraryOptions(optionsSource),
    };
  }

  async findOne(id: string, includeAudioUrls = false) {
    const release = await this.prisma.release.findUnique({
      where: { id },
      include: {
        images: true,
        tracks: {
          include: {
            audioFiles: true,
            storeLinks: true,
          },
          orderBy: {
            position: 'asc',
          },
        },
      },
    });

    if (!release) {
      return null;
    }

    const isManualRelease = release.discogsReleaseId < 0;
    const needsHydration =
      !isManualRelease &&
      (release.tracks.length === 0 ||
        release.genres.length === 0 ||
        release.styles.length === 0 ||
        !release.country ||
        !release.coverStorageUrl ||
        !release.coverThumbStorageUrl ||
        !release.coverMediumStorageUrl);

    if (!needsHydration) {
      return this.signReleaseUrls(release, includeAudioUrls);
    }

    await this.discogsService.hydrateReleaseFromDiscogs(id);

    const hydratedRelease = await this.prisma.release.findUnique({
      where: { id },
      include: {
        images: true,
        tracks: {
          include: {
            audioFiles: true,
            storeLinks: true,
          },
          orderBy: {
            position: 'asc',
          },
        },
      },
    });

    if (!hydratedRelease) {
      return null;
    }

    return this.signReleaseUrls(hydratedRelease, includeAudioUrls);
  }

  async deleteRelease(id: string) {
    const release = await this.prisma.release.findUnique({
      where: { id },
      include: {
        images: true,
        tracks: {
          include: {
            audioFiles: true,
          },
        },
      },
    });

    if (!release) {
      throw new NotFoundException('Release not found');
    }

    const coversBucket = this.configService.get<string>('SELECTEL_S3_BUCKET_COVERS') || 'covers';
    const audioBucket = this.configService.get<string>('SELECTEL_S3_BUCKET_AUDIO') || 'audio';
    const coverKeys = [
      release.coverStorageKey,
      release.coverThumbStorageKey,
      release.coverMediumStorageKey,
      ...release.images.map((image) => image.storageKey),
    ].filter((key): key is string => Boolean(key));
    const audioKeys = release.tracks.flatMap((track) =>
      track.audioFiles.map((audioFile) => audioFile.storageKey),
    );

    await Promise.all([
      ...[...new Set(coverKeys)].map((key) => this.deleteStorageObject(coversBucket, key)),
      ...[...new Set(audioKeys)].map((key) => this.deleteStorageObject(audioBucket, key)),
    ]);

    await this.prisma.release.delete({
      where: { id },
    });

    return { deleted: true };
  }

  async uploadCover(id: string, file: Express.Multer.File) {
    const release = await this.prisma.release.findUnique({
      where: { id },
      include: {
        images: true,
      },
    });

    if (!release) {
      throw new NotFoundException('Release not found');
    }

    await this.uploadReleaseCover(release, file);
    return this.findOne(id, true);
  }

  async updateReleaseStyles(id: string, styles: string[]) {
    const normalizedStyles = [
      ...new Map(
        styles
          .map((style) => style.trim())
          .filter(Boolean)
          .map((style) => [style.toLocaleLowerCase(), style] as const),
      ).values(),
    ];

    await this.prisma.release.update({
      where: { id },
      data: {
        styles: normalizedStyles,
      },
    });

    return this.findOne(id, true);
  }

  async updateTrackMetadata(trackId: string, dto: UpdateTrackMetadataDto) {
    const key = dto.key?.trim() || null;

    return this.prisma.track.update({
      where: { id: trackId },
      data: {
        bpm: dto.bpm ?? null,
        key,
      },
    });
  }

  private parseManualTracks(rawTracks?: string) {
    if (!rawTracks) {
      throw new BadRequestException('At least one track is required');
    }

    let parsed: ManualTrackInput[];
    try {
      parsed = JSON.parse(rawTracks) as ManualTrackInput[];
    } catch {
      throw new BadRequestException('Invalid tracks payload');
    }

    const tracks = parsed
      .map((track) => ({
        ...track,
        title: track.title?.trim(),
      }))
      .filter((track) => track.title);

    if (!tracks.length) {
      throw new BadRequestException('At least one track is required');
    }

    return tracks;
  }

  private async deleteStorageObject(bucket: string, key: string) {
    try {
      await this.storageService.deleteObject(bucket, key);
    } catch {
      // Keep database deletion reliable even if an object was already removed from S3.
    }
  }

  private splitList(value?: string) {
    return (value || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  private parseOptionalBpm(value?: number | string) {
    if (value === undefined || value === null || value === '') {
      return null;
    }

    const bpm = Number(value);
    if (!Number.isFinite(bpm) || bpm <= 0) {
      throw new BadRequestException('BPM must be a positive number');
    }

    return bpm;
  }

  private buildLibraryOptions(
    releases: Array<{
      artist: string;
      styles: string[];
      tracks: Array<{
        artists: string[];
        key: string | null;
      }>;
    }>,
  ) {
    const styles = new Set<string>();
    const artists = new Set<string>();
    const keys = new Set<string>();

    for (const release of releases) {
      artists.add(release.artist);

      for (const style of release.styles) {
        if (style.trim()) {
          styles.add(style);
        }
      }

      for (const track of release.tracks) {
        if (track.artists.length) {
          track.artists.forEach((artist) => artists.add(artist));
        }
        if (track.key?.trim()) {
          keys.add(track.key);
        }
      }
    }

    return {
      styles: [...styles].sort((a, b) => a.localeCompare(b)),
      artists: [...artists].sort((a, b) => a.localeCompare(b)),
      keys: [...keys].sort((a, b) => a.localeCompare(b)),
    };
  }

  private async getNextManualDiscogsId() {
    const baseId = -Math.floor(Date.now() / 1000);
    let candidate = baseId;

    while (await this.prisma.release.findUnique({ where: { discogsReleaseId: candidate } })) {
      candidate -= 1;
    }

    return candidate;
  }

  private getImageExtension(file: Express.Multer.File) {
    if (file.mimetype === 'image/png') {
      return 'png';
    }

    if (file.mimetype === 'image/webp') {
      return 'webp';
    }

    return 'jpg';
  }

  private async uploadManualCover(releaseId: string, file: Express.Multer.File) {
    const release = await this.prisma.release.findUnique({
      where: {
        id: releaseId,
      },
      include: {
        images: true,
      },
    });

    if (!release) {
      throw new NotFoundException('Release not found');
    }

    await this.uploadReleaseCover(release, file);
  }

  private async uploadReleaseCover(
    release: {
      id: string;
      discogsReleaseId: number;
      coverStorageKey: string | null;
      coverThumbStorageKey: string | null;
      coverMediumStorageKey: string | null;
      images: Array<{ storageKey: string; type: ImageType }>;
    },
    file: Express.Multer.File,
  ) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      throw new BadRequestException('Cover must be JPEG, PNG or WebP');
    }

    const coversBucket = this.configService.get<string>('SELECTEL_S3_BUCKET_COVERS') || 'covers';
    const safeName =
      sanitizeFilename(file.originalname).replace(/\s+/g, '-').toLowerCase() ||
      `front.${this.getImageExtension(file)}`;
    const storageKey = `covers/manual/${release.id}/${safeName}`;
    const thumbStorageKey = `covers/manual/${release.id}/thumb.webp`;
    const mediumStorageKey = `covers/manual/${release.id}/medium.webp`;
    const [thumbBuffer, mediumBuffer] = await Promise.all([
      sharp(file.buffer)
        .rotate()
        .resize(320, 320, { fit: 'cover' })
        .webp({ quality: 78 })
        .toBuffer(),
      sharp(file.buffer)
        .rotate()
        .resize(900, 900, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 84 })
        .toBuffer(),
    ]);
    const [url, thumbUrl, mediumUrl] = await Promise.all([
      this.storageService.uploadObject({
        bucket: coversBucket,
        key: storageKey,
        body: file.buffer,
        contentType: file.mimetype,
      }),
      this.storageService.uploadObject({
        bucket: coversBucket,
        key: thumbStorageKey,
        body: thumbBuffer,
        contentType: 'image/webp',
      }),
      this.storageService.uploadObject({
        bucket: coversBucket,
        key: mediumStorageKey,
        body: mediumBuffer,
        contentType: 'image/webp',
      }),
    ]);
    const nextKeys = new Set([storageKey, thumbStorageKey, mediumStorageKey]);
    const previousKeys = [
      release.coverStorageKey,
      release.coverThumbStorageKey,
      release.coverMediumStorageKey,
      ...release.images
        .filter((image) => image.type === ImageType.COVER)
        .map((image) => image.storageKey),
    ].filter((key): key is string => typeof key === 'string' && key.length > 0 && !nextKeys.has(key));

    await Promise.all([...new Set(previousKeys)].map((key) => this.deleteStorageObject(coversBucket, key)));

    await this.prisma.release.update({
      where: {
        id: release.id,
      },
      data: {
        coverStorageKey: storageKey,
        coverStorageUrl: url,
        coverThumbStorageKey: thumbStorageKey,
        coverThumbStorageUrl: thumbUrl,
        coverMediumStorageKey: mediumStorageKey,
        coverMediumStorageUrl: mediumUrl,
        coverImageUrl: url,
        images: {
          deleteMany: {
            type: ImageType.COVER,
          },
          create: {
            type: ImageType.COVER,
            url: url || '',
            storageKey,
          },
        },
      },
    });
  }

  private async signReleaseUrls<
    T extends {
      coverStorageKey?: string | null;
      coverStorageUrl?: string | null;
      coverThumbStorageKey?: string | null;
      coverThumbStorageUrl?: string | null;
      coverMediumStorageKey?: string | null;
      coverMediumStorageUrl?: string | null;
      images?: Array<{
        storageKey: string;
        url: string;
      }>;
      tracks: Array<{ audioFiles: Array<{ storageKey: string; storageUrl: string | null }> }>;
    },
  >(
    release: T,
    includeAudioUrls = false,
  ) {
    const audioBucket = this.configService.get<string>('SELECTEL_S3_BUCKET_AUDIO') || 'audio';
    const coversBucket = this.configService.get<string>('SELECTEL_S3_BUCKET_COVERS') || 'covers';

    return {
      ...release,
      coverStorageUrl:
        release.coverStorageKey
          ? (await this.storageService.getSignedObjectUrl(coversBucket, release.coverStorageKey)) ||
            release.coverStorageUrl
          : release.coverStorageUrl,
      coverThumbStorageUrl:
        release.coverThumbStorageKey
          ? (await this.storageService.getSignedObjectUrl(coversBucket, release.coverThumbStorageKey)) ||
            release.coverThumbStorageUrl
          : release.coverThumbStorageUrl,
      coverMediumStorageUrl:
        release.coverMediumStorageKey
          ? (await this.storageService.getSignedObjectUrl(
              coversBucket,
              release.coverMediumStorageKey,
            )) || release.coverMediumStorageUrl
          : release.coverMediumStorageUrl,
      images: release.images
        ? await Promise.all(
            release.images.map(async (image) => ({
              ...image,
              url:
                (await this.storageService.getSignedObjectUrl(coversBucket, image.storageKey)) ||
                image.url,
            })),
          )
        : release.images,
      tracks: await Promise.all(
        release.tracks.map(async (track) => ({
          ...track,
          audioFiles: includeAudioUrls
            ? await Promise.all(
                track.audioFiles.map(async (audioFile) => ({
                  ...audioFile,
                  storageUrl:
                    (await this.storageService.getSignedObjectUrl(audioBucket, audioFile.storageKey)) ||
                    audioFile.storageUrl,
                })),
              )
            : track.audioFiles.map((audioFile) => ({
                ...audioFile,
                storageUrl: null,
              })),
        })),
      ),
    };
  }
}
