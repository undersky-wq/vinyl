import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { CreatePlaylistDto } from './dto/create-playlist.dto';
import { UpdatePlaylistDto } from './dto/update-playlist.dto';

@Injectable()
export class PlaylistsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly storageService: StorageService,
  ) {}

  async findAll(userId: string) {
    const playlists = await this.prisma.playlist.findMany({
      where: { userId },
      include: {
        items: {
          include: {
            track: {
              include: {
                release: true,
                audioFiles: true,
              },
            },
          },
          orderBy: {
            sortOrder: 'asc',
          },
        },
      },
      orderBy: {
        sortOrder: 'asc',
      },
    });

    return Promise.all(playlists.map((playlist) => this.signPlaylistAudioUrls(playlist)));
  }

  async findSummaries(userId: string) {
    return this.prisma.playlist.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        description: true,
        sortOrder: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            items: true,
          },
        },
      },
      orderBy: {
        sortOrder: 'asc',
      },
    });
  }

  async findOne(id: string) {
    const playlist = await this.prisma.playlist.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            track: {
              include: {
                release: true,
                audioFiles: true,
              },
            },
          },
          orderBy: {
            sortOrder: 'asc',
          },
        },
      },
    });

    if (!playlist) {
      return null;
    }

    return this.signPlaylistAudioUrls(playlist);
  }

  async create(userId: string, dto: CreatePlaylistDto) {
    await this.prisma.user.upsert({
      where: { id: userId },
      create: {
        id: userId,
        displayName: 'Моя коллекция',
      },
      update: {},
    });

    const playlist = await this.prisma.playlist.create({
      data: {
        userId,
        name: dto.name,
        description: dto.description,
        sortOrder: await this.getNextPlaylistSortOrder(userId),
        items: dto.trackIds?.length
          ? {
              create: dto.trackIds.map((trackId, index) => ({
                trackId,
                sortOrder: index,
              })),
            }
          : undefined,
      },
      include: {
        items: true,
      },
    });

    return this.findOne(playlist.id);
  }

  async addItem(userId: string, playlistId: string, trackId: string) {
    const playlist = await this.prisma.playlist.findUnique({
      where: { id: playlistId },
      include: {
        items: {
          orderBy: {
            sortOrder: 'asc',
          },
        },
      },
    });

    if (!playlist || playlist.userId !== userId) {
      throw new NotFoundException('Playlist not found');
    }

    const alreadyExists = playlist.items.some((item) => item.trackId === trackId);
    if (!alreadyExists) {
      const nextSortOrder =
        playlist.items.reduce((maxSortOrder, item) => Math.max(maxSortOrder, item.sortOrder), -1) + 1;

      await this.prisma.playlistItem.create({
        data: {
          playlistId,
          trackId,
          sortOrder: nextSortOrder,
        },
      });
    }

    return this.findOne(playlistId);
  }

  async update(userId: string, playlistId: string, dto: UpdatePlaylistDto) {
    const playlist = await this.prisma.playlist.findUnique({
      where: { id: playlistId },
      select: {
        userId: true,
      },
    });

    if (!playlist || playlist.userId !== userId) {
      throw new NotFoundException('Playlist not found');
    }

    const nextName = dto.name?.trim();
    const nextDescription = dto.description?.trim();

    await this.prisma.playlist.update({
      where: { id: playlistId },
      data: {
        ...(nextName ? { name: nextName } : {}),
        ...(dto.description !== undefined ? { description: nextDescription || null } : {}),
      },
    });

    return this.findOne(playlistId);
  }

  async removeItem(userId: string, playlistId: string, trackId: string) {
    const playlist = await this.prisma.playlist.findUnique({
      where: { id: playlistId },
      select: {
        userId: true,
      },
    });

    if (!playlist || playlist.userId !== userId) {
      throw new NotFoundException('Playlist not found');
    }

    await this.prisma.playlistItem.deleteMany({
      where: {
        playlistId,
        trackId,
      },
    });

    return this.findOne(playlistId);
  }

  async reorder(userId: string, playlistId: string, trackIds: string[]) {
    const playlist = await this.prisma.playlist.findUnique({
      where: { id: playlistId },
      include: {
        items: true,
      },
    });

    if (!playlist || playlist.userId !== userId) {
      throw new NotFoundException('Playlist not found');
    }

    const existingTrackIds = new Set(playlist.items.map((item) => item.trackId));
    const nextTrackIds = trackIds.filter((trackId) => existingTrackIds.has(trackId));
    const missingTrackIds = playlist.items
      .map((item) => item.trackId)
      .filter((trackId) => !nextTrackIds.includes(trackId));
    const orderedTrackIds = [...nextTrackIds, ...missingTrackIds];

    await this.prisma.$transaction([
      ...orderedTrackIds.map((trackId, index) =>
        this.prisma.playlistItem.update({
          where: {
            playlistId_trackId: {
              playlistId,
              trackId,
            },
          },
          data: {
            sortOrder: 10000 + index,
          },
        }),
      ),
      ...orderedTrackIds.map((trackId, index) =>
        this.prisma.playlistItem.update({
          where: {
            playlistId_trackId: {
              playlistId,
              trackId,
            },
          },
          data: {
            sortOrder: index,
          },
        }),
      ),
    ]);

    return this.findOne(playlistId);
  }

  async reorderPlaylists(userId: string, playlistIds: string[]) {
    const playlists = await this.prisma.playlist.findMany({
      where: { userId },
      select: { id: true },
      orderBy: { sortOrder: 'asc' },
    });
    const existingIds = new Set(playlists.map((playlist) => playlist.id));
    const nextIds = playlistIds.filter((playlistId) => existingIds.has(playlistId));
    const missingIds = playlists.map((playlist) => playlist.id).filter((playlistId) => !nextIds.includes(playlistId));
    const orderedIds = [...nextIds, ...missingIds];

    await this.prisma.$transaction([
      ...orderedIds.map((playlistId, index) =>
        this.prisma.playlist.update({
          where: { id: playlistId },
          data: { sortOrder: 10000 + index },
        }),
      ),
      ...orderedIds.map((playlistId, index) =>
        this.prisma.playlist.update({
          where: { id: playlistId },
          data: { sortOrder: index },
        }),
      ),
    ]);

    return this.findSummaries(userId);
  }

  private async getNextPlaylistSortOrder(userId: string) {
    const lastPlaylist = await this.prisma.playlist.findFirst({
      where: { userId },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });

    return (lastPlaylist?.sortOrder ?? -1) + 1;
  }

  private async signPlaylistAudioUrls<
    T extends {
      items: Array<{
        track: {
          release: {
            coverStorageKey?: string | null;
            coverStorageUrl?: string | null;
            coverThumbStorageKey?: string | null;
            coverThumbStorageUrl?: string | null;
            coverMediumStorageKey?: string | null;
            coverMediumStorageUrl?: string | null;
          };
          audioFiles: Array<{
            storageKey: string;
            storageUrl: string | null;
            normalizedStorageKey?: string | null;
            normalizedStorageUrl?: string | null;
          }>;
        };
      }>;
    },
  >(playlist: T) {
    const bucket = this.configService.get<string>('SELECTEL_S3_BUCKET_AUDIO') || 'audio';

    return {
      ...playlist,
      items: await Promise.all(
        playlist.items.map(async (item) => ({
          ...item,
          track: {
            ...item.track,
            release: {
              ...item.track.release,
              coverStorageUrl:
                item.track.release.coverStorageKey
                  ? (await this.storageService.getSignedObjectUrl(
                      this.configService.get<string>('SELECTEL_S3_BUCKET_COVERS') || 'covers',
                      item.track.release.coverStorageKey,
                    )) || item.track.release.coverStorageUrl
                  : item.track.release.coverStorageUrl,
              coverThumbStorageUrl:
                item.track.release.coverThumbStorageKey
                  ? (await this.storageService.getSignedObjectUrl(
                      this.configService.get<string>('SELECTEL_S3_BUCKET_COVERS') || 'covers',
                      item.track.release.coverThumbStorageKey,
                    )) || item.track.release.coverThumbStorageUrl
                  : item.track.release.coverThumbStorageUrl,
              coverMediumStorageUrl:
                item.track.release.coverMediumStorageKey
                  ? (await this.storageService.getSignedObjectUrl(
                      this.configService.get<string>('SELECTEL_S3_BUCKET_COVERS') || 'covers',
                      item.track.release.coverMediumStorageKey,
                    )) || item.track.release.coverMediumStorageUrl
                  : item.track.release.coverMediumStorageUrl,
            },
            audioFiles: await Promise.all(
              item.track.audioFiles.map(async (audioFile) => ({
                ...audioFile,
                storageUrl:
                  (await this.storageService.getSignedObjectUrl(
                    bucket,
                    audioFile.normalizedStorageKey || audioFile.storageKey,
                  )) ||
                  audioFile.normalizedStorageUrl ||
                  audioFile.storageUrl,
              })),
            ),
          },
        })),
      ),
    };
  }
}
