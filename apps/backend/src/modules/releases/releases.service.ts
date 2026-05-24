import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ImageType, Prisma, User, UserRole } from '@prisma/client';
import sanitizeFilename from 'sanitize-filename';
import sharp from 'sharp';
import { AudioService } from '../audio/audio.service';
import { DiscogsService } from '../discogs/discogs.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { CreateManualReleaseDto, ManualTrackInput } from './dto/create-manual-release.dto';
import { CreateReleaseTrackDto } from './dto/create-release-track.dto';
import { CreateTimelineCommentDto } from './dto/create-timeline-comment.dto';
import { QueryReleasesDto } from './dto/query-releases.dto';
import { UpdateReleaseMetadataDto } from './dto/update-release-metadata.dto';
import { UpdateTimelineCommentDto } from './dto/update-timeline-comment.dto';
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
        isMix: body.isMix === 'true',
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
    const search = query.search?.trim();
    const searchReleaseIds = search ? await this.findReleaseIdsBySearch(userId, search) : [];
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
      isMix: query.isMix === 'true',
      ...(genres.length ? { genres: { hasSome: genres } } : {}),
      ...(styles.length ? { styles: { hasSome: styles } } : {}),
      ...(search
        ? {
            id: { in: searchReleaseIds },
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
            isMix: true,
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
        isMix: query.isMix === 'true',
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

    const searchReleaseIds = await this.findReleaseIdsBySearch(userId, search);
    const releases = await this.prisma.release.findMany({
      where: {
        collectionItems: {
          some: {
            userId,
          },
        },
        id: { in: searchReleaseIds },
      },
      take: 16,
      include: {
        tracks: {
          take: 12,
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
        const trackArtist = track.artists.length ? track.artists.join(', ') : release.artist;
        const matchesTrack =
          track.title.toLowerCase().includes(search.toLowerCase()) ||
          trackArtist.toLowerCase().includes(search.toLowerCase());

        if (!matchesTrack) {
          continue;
        }

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

  private async findReleaseIdsBySearch(userId: string, search: string) {
    const pattern = `%${search}%`;
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT DISTINCT r.id
      FROM "Release" r
      INNER JOIN "CollectionItem" c ON c."releaseId" = r.id
      LEFT JOIN "Track" t ON t."releaseId" = r.id
      WHERE c."userId" = ${userId}
        AND (
          r.artist ILIKE ${pattern}
          OR r.title ILIKE ${pattern}
          OR t.title ILIKE ${pattern}
          OR array_to_string(t.artists, ' ') ILIKE ${pattern}
        )
    `;

    return rows.map((row) => row.id);
  }

  async findLibraryFeed(query: QueryReleasesDto) {
    const userId = query.userId || 'default-user';
    const take = query.limit ? Math.min(Math.max(Number(query.limit), 1), 60) : 40;
    const skip = query.offset ? Math.max(Number(query.offset), 0) : 0;
    const styles = this.splitList(query.style);
    const artist = query.artist?.trim();
    const keys = this.splitList(query.key);
    const search = query.search?.trim();
    const searchReleaseIds = search ? await this.findReleaseIdsBySearch(userId, search) : [];

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
      ...(keys.length ? { key: { in: keys } } : {}),
    };
    const where: Prisma.ReleaseWhereInput = {
      collectionItems: {
        some: {
          userId,
        },
      },
      isMix: query.isMix === 'true',
      ...(styles.length ? { styles: { hasSome: styles } } : {}),
      ...(search
        ? {
            id: {
              in: searchReleaseIds,
            },
          }
        : {}),
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
          isMix: query.isMix === 'true',
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

  async findLibraryQueue(query: QueryReleasesDto) {
    const userId = query.userId || 'default-user';
    const styles = this.splitList(query.style);
    const keys = this.splitList(query.key);
    const search = query.search?.trim();
    const searchReleaseIds = search ? await this.findReleaseIdsBySearch(userId, search) : [];
    const audioBucket = this.configService.get<string>('SELECTEL_S3_BUCKET_AUDIO') || 'audio';
    const coversBucket = this.configService.get<string>('SELECTEL_S3_BUCKET_COVERS') || 'covers';

    const trackWhere: Prisma.TrackWhereInput = {
      audioFiles: {
        some: {},
      },
      ...(keys.length ? { key: { in: keys } } : {}),
      release: {
        is: {
          collectionItems: {
            some: {
              userId,
            },
          },
          isMix: query.isMix === 'true',
          ...(styles.length ? { styles: { hasSome: styles } } : {}),
          ...(search
            ? {
                id: {
                  in: searchReleaseIds,
                },
              }
            : {}),
        },
      },
    };

    const tracks = await this.prisma.track.findMany({
      where: trackWhere,
      take: 1200,
      include: {
        audioFiles: true,
        release: true,
      },
      orderBy: [
        {
          release: {
            updatedAt: 'desc',
          },
        },
        {
          position: 'asc',
        },
      ],
    });

    return Promise.all(
      tracks.map(async (track) => {
        const audioFile = track.audioFiles[0];
        const audioUrl = audioFile
          ? (await this.storageService.getSignedObjectUrl(
              audioBucket,
              audioFile.normalizedStorageKey || audioFile.storageKey,
            )) ||
            audioFile.normalizedStorageUrl ||
            audioFile.storageUrl
          : null;
        const coverUrl = track.release.coverThumbStorageKey
          ? (await this.storageService.getSignedObjectUrl(coversBucket, track.release.coverThumbStorageKey)) ||
            track.release.coverThumbStorageUrl
          : track.release.coverThumbStorageUrl ||
            track.release.coverMediumStorageUrl ||
            track.release.coverStorageUrl ||
            track.release.coverImageUrl;

        return {
          id: track.id,
          title: track.title,
          artist: track.artists.length ? track.artists.join(', ') : track.release.artist,
          audioUrl,
          coverUrl,
          releaseId: track.releaseId,
          durationRaw: track.durationRaw,
          durationSec: track.durationSec,
          waveformData: track.waveformData,
        };
      }),
    );
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

    return this.signReleaseUrls(release, includeAudioUrls || release.isMix);
  }

  async findTimelineComments(releaseId: string) {
    const release = await this.prisma.release.findUnique({
      where: { id: releaseId },
      select: { id: true },
    });

    if (!release) {
      throw new NotFoundException('Release not found');
    }

    const comments = await this.prisma.timelineComment.findMany({
      where: { releaseId },
      include: {
        user: {
          select: {
            id: true,
            displayName: true,
            avatarStorageKey: true,
            avatarStorageUrl: true,
          },
        },
      },
      orderBy: [
        {
          second: 'asc',
        },
        {
          createdAt: 'asc',
        },
      ],
    });

    return Promise.all(comments.map((comment) => this.signTimelineComment(comment)));
  }

  async createTimelineComment(releaseId: string, user: User, dto: CreateTimelineCommentDto) {
    const release = await this.prisma.release.findUnique({
      where: { id: releaseId },
      select: { id: true },
    });

    if (!release) {
      throw new NotFoundException('Release not found');
    }

    const text = dto.text.trim();
    if (!text) {
      throw new BadRequestException('Comment text is required');
    }

    const comment = await this.prisma.timelineComment.create({
      data: {
        releaseId,
        userId: user.id,
        second: Math.max(0, Math.floor(dto.second)),
        text: text.slice(0, 280),
      },
      include: {
        user: {
          select: {
            id: true,
            displayName: true,
            avatarStorageKey: true,
            avatarStorageUrl: true,
          },
        },
      },
    });

    return this.signTimelineComment(comment);
  }

  async updateTimelineComment(
    releaseId: string,
    commentId: string,
    user: User,
    dto: UpdateTimelineCommentDto,
  ) {
    const comment = await this.prisma.timelineComment.findUnique({
      where: { id: commentId },
      include: {
        user: {
          select: {
            id: true,
            displayName: true,
            avatarStorageKey: true,
            avatarStorageUrl: true,
          },
        },
      },
    });

    if (!comment || comment.releaseId !== releaseId) {
      throw new NotFoundException('Comment not found');
    }

    if (comment.userId !== user.id && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Comment can be edited only by its author or admin');
    }

    const text = dto.text.trim();
    if (!text) {
      throw new BadRequestException('Comment text is required');
    }

    const updatedComment = await this.prisma.timelineComment.update({
      where: { id: commentId },
      data: {
        text: text.slice(0, 280),
      },
      include: {
        user: {
          select: {
            id: true,
            displayName: true,
            avatarStorageKey: true,
            avatarStorageUrl: true,
          },
        },
      },
    });

    return this.signTimelineComment(updatedComment);
  }

  async deleteTimelineComment(releaseId: string, commentId: string, user: User) {
    const comment = await this.prisma.timelineComment.findUnique({
      where: { id: commentId },
      select: {
        id: true,
        releaseId: true,
        userId: true,
      },
    });

    if (!comment || comment.releaseId !== releaseId) {
      throw new NotFoundException('Comment not found');
    }

    if (comment.userId !== user.id && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Comment can be deleted only by its author or admin');
    }

    await this.prisma.timelineComment.delete({
      where: { id: commentId },
    });

    return { deleted: true };
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
      track.audioFiles.flatMap((audioFile) =>
        [audioFile.storageKey, audioFile.normalizedStorageKey].filter(
          (key): key is string => Boolean(key),
        ),
      ),
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

    const updatedRelease = await this.prisma.release.findUnique({
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

    if (!updatedRelease) {
      throw new NotFoundException('Release not found');
    }

    return this.signReleaseUrls(updatedRelease, true);
  }

  async updateReleaseMetadata(id: string, dto: UpdateReleaseMetadataDto) {
    const data: Prisma.ReleaseUpdateInput = {};

    if ('artist' in dto) {
      const artist = dto.artist?.trim();
      if (!artist) {
        throw new BadRequestException('Release artist is required');
      }
      data.artist = artist;
    }

    if ('title' in dto) {
      const title = dto.title?.trim();
      if (!title) {
        throw new BadRequestException('Release title is required');
      }
      data.title = title;
    }

    if ('year' in dto) {
      data.year = dto.year ?? null;
    }

    const updatedRelease = await this.prisma.release.update({
      where: { id },
      data,
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

    return this.signReleaseUrls(updatedRelease, true);
  }

  async updateTrackMetadata(trackId: string, dto: UpdateTrackMetadataDto) {
    const data: Prisma.TrackUpdateInput = {};

    if ('bpm' in dto) {
      data.bpm = dto.bpm ?? null;
    }

    if ('key' in dto) {
      data.key = dto.key?.trim() || null;
    }

    if ('title' in dto) {
      const title = dto.title?.trim();
      if (!title) {
        throw new BadRequestException('Track title is required');
      }

      data.title = title;
    }

    if ('artists' in dto) {
      data.artists = (dto.artists || []).map((artist) => artist.trim()).filter(Boolean);
    }

    return this.prisma.track.update({
      where: { id: trackId },
      data,
    });
  }

  async createTrack(releaseId: string, dto: CreateReleaseTrackDto) {
    const title = dto.title?.trim();
    if (!title) {
      throw new BadRequestException('Track title is required');
    }

    const release = await this.prisma.release.findUnique({
      where: { id: releaseId },
      select: { id: true },
    });
    const trackCount = await this.prisma.track.count({
      where: { releaseId },
    });

    if (!release) {
      throw new NotFoundException('Release not found');
    }

    const fallbackPosition = `${trackCount + 1}`;
    return this.prisma.track.create({
      data: {
        releaseId,
        position: dto.position?.trim() || fallbackPosition,
        title,
        artists: dto.artist?.trim() ? [dto.artist.trim()] : [],
      },
      include: {
        audioFiles: true,
        storeLinks: true,
      },
    });
  }

  async deleteTrack(trackId: string) {
    const track = await this.prisma.track.findUnique({
      where: { id: trackId },
      include: {
        audioFiles: true,
      },
    });

    if (!track) {
      throw new NotFoundException('Track not found');
    }

    const audioBucket = this.configService.get<string>('SELECTEL_S3_BUCKET_AUDIO') || '';
    await Promise.all(
      track.audioFiles.flatMap((audioFile) =>
        [audioFile.storageKey, audioFile.normalizedStorageKey]
          .filter((key): key is string => Boolean(key))
          .map((key) => this.storageService.deleteObject(audioBucket, key)),
      ),
    );

    await this.prisma.track.delete({
      where: { id: trackId },
    });

    return { deleted: true };
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
      tracks: Array<{
        audioFiles: Array<{
          storageKey: string;
          storageUrl: string | null;
          normalizedStorageKey?: string | null;
          normalizedStorageUrl?: string | null;
        }>;
      }>;
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
                    (await this.storageService.getSignedObjectUrl(
                      audioBucket,
                      audioFile.normalizedStorageKey || audioFile.storageKey,
                    )) ||
                    audioFile.normalizedStorageUrl ||
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

  private async signTimelineComment<
    T extends {
      user: {
        avatarStorageKey?: string | null;
        avatarStorageUrl?: string | null;
      };
    },
  >(comment: T) {
    const avatarBucket =
      this.configService.get<string>('SELECTEL_S3_BUCKET_AVATARS')?.trim() ||
      this.configService.get<string>('SELECTEL_S3_BUCKET_COVERS')?.trim() ||
      'covers';

    return {
      ...comment,
      user: {
        ...comment.user,
        avatarStorageUrl: comment.user.avatarStorageKey
          ? (await this.storageService.getSignedObjectUrl(avatarBucket, comment.user.avatarStorageKey)) ||
            comment.user.avatarStorageUrl
          : comment.user.avatarStorageUrl,
      },
    };
  }
}
