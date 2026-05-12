import { Body, Controller, Get, NotFoundException, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AdminGuard, AuthGuard } from './auth/auth.guards';
import { PrismaService } from './prisma/prisma.service';
import { StorageService } from './storage/storage.service';

@Controller()
export class AppController {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
  ) {}

  @Get('health')
  health() {
    return {
      ok: true,
      service: 'vinyl-backend',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('users')
  @UseGuards(AdminGuard)
  async users() {
    const coversBucket = this.configService.get<string>('SELECTEL_S3_BUCKET_COVERS') || 'covers';
    const users = await this.prisma.user.findMany({
      orderBy: {
        createdAt: 'asc',
      },
      select: {
        id: true,
        email: true,
        displayName: true,
        discogsUsername: true,
        role: true,
        avatarStorageKey: true,
        avatarStorageUrl: true,
        createdAt: true,
        _count: {
          select: {
            collectionItems: true,
            playlists: true,
            audioFiles: true,
            favoriteTracks: true,
          },
        },
      },
    });

    return Promise.all(
      users.map(async (user) => ({
        ...user,
        avatarStorageUrl:
          user.avatarStorageKey
            ? (await this.storageService.getSignedObjectUrl(coversBucket, user.avatarStorageKey)) ||
              user.avatarStorageUrl
            : user.avatarStorageUrl,
      })),
    );
  }

  @Get('favorites')
  @UseGuards(AuthGuard)
  async favorites(@Req() request: any) {
    const items = await this.prisma.favoriteTrack.findMany({
      where: {
        userId: request.user.id,
      },
      select: {
        trackId: true,
      },
    });

    return items.map((item) => item.trackId);
  }

  @Get('favorites/tracks')
  @UseGuards(AuthGuard)
  async favoriteTracks(@Req() request: any) {
    const audioBucket = this.configService.get<string>('SELECTEL_S3_BUCKET_AUDIO') || 'audio';
    const coversBucket = this.configService.get<string>('SELECTEL_S3_BUCKET_COVERS') || 'covers';
    const items = await this.prisma.favoriteTrack.findMany({
      where: {
        userId: request.user.id,
      },
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        track: {
          include: {
            audioFiles: true,
            release: {
              include: {
                images: true,
                tracks: {
                  include: {
                    audioFiles: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    return Promise.all(
      items.map(async (item) => ({
        ...item.track,
        release: {
          ...item.track.release,
          coverStorageUrl:
            item.track.release.coverStorageKey
              ? (await this.storageService.getSignedObjectUrl(
                  coversBucket,
                  item.track.release.coverStorageKey,
                )) || item.track.release.coverStorageUrl
              : item.track.release.coverStorageUrl,
          coverThumbStorageUrl:
            item.track.release.coverThumbStorageKey
              ? (await this.storageService.getSignedObjectUrl(
                  coversBucket,
                  item.track.release.coverThumbStorageKey,
                )) || item.track.release.coverThumbStorageUrl
              : item.track.release.coverThumbStorageUrl,
          coverMediumStorageUrl:
            item.track.release.coverMediumStorageKey
              ? (await this.storageService.getSignedObjectUrl(
                  coversBucket,
                  item.track.release.coverMediumStorageKey,
                )) || item.track.release.coverMediumStorageUrl
              : item.track.release.coverMediumStorageUrl,
        },
        audioFiles: await Promise.all(
          item.track.audioFiles.map(async (audioFile) => ({
            ...audioFile,
            storageUrl:
              (await this.storageService.getSignedObjectUrl(
                audioBucket,
                audioFile.normalizedStorageKey || audioFile.storageKey,
              )) ||
              audioFile.normalizedStorageUrl ||
              audioFile.storageUrl,
          })),
        ),
      })),
    );
  }

  @Get('tracks/:id/player')
  @UseGuards(AuthGuard)
  async playerTrack(@Param('id') id: string) {
    const audioBucket = this.configService.get<string>('SELECTEL_S3_BUCKET_AUDIO') || 'audio';
    const coversBucket = this.configService.get<string>('SELECTEL_S3_BUCKET_COVERS') || 'covers';
    const track = await this.prisma.track.findUnique({
      where: { id },
      include: {
        audioFiles: true,
        release: true,
      },
    });

    if (!track) {
      throw new NotFoundException('Track not found');
    }

    const coverStorageUrl =
      track.release.coverStorageKey
        ? (await this.storageService.getSignedObjectUrl(coversBucket, track.release.coverStorageKey)) ||
          track.release.coverStorageUrl
        : track.release.coverStorageUrl;
    const coverThumbStorageUrl =
      track.release.coverThumbStorageKey
        ? (await this.storageService.getSignedObjectUrl(coversBucket, track.release.coverThumbStorageKey)) ||
          track.release.coverThumbStorageUrl
        : track.release.coverThumbStorageUrl;
    const coverMediumStorageUrl =
      track.release.coverMediumStorageKey
        ? (await this.storageService.getSignedObjectUrl(coversBucket, track.release.coverMediumStorageKey)) ||
          track.release.coverMediumStorageUrl
        : track.release.coverMediumStorageUrl;
    const audioFile = track.audioFiles[0];

    return {
      id: track.id,
      title: track.title,
      artist: track.artists.length ? track.artists.join(', ') : track.release.artist,
      audioUrl: audioFile
        ? (await this.storageService.getSignedObjectUrl(
            audioBucket,
            audioFile.normalizedStorageKey || audioFile.storageKey,
          )) ||
          audioFile.normalizedStorageUrl ||
          audioFile.storageUrl ||
          ''
        : '',
      coverUrl:
        coverThumbStorageUrl ||
        coverMediumStorageUrl ||
        coverStorageUrl ||
        track.release.coverImageUrl ||
        '',
      waveformData: track.waveformData,
    };
  }

  @Post('favorites')
  @UseGuards(AuthGuard)
  async toggleFavorite(@Req() request: any, @Body() body: { trackId: string }) {
    const existing = await this.prisma.favoriteTrack.findUnique({
      where: {
        userId_trackId: {
          userId: request.user.id,
          trackId: body.trackId,
        },
      },
    });

    if (existing) {
      await this.prisma.favoriteTrack.delete({
        where: {
          userId_trackId: {
            userId: request.user.id,
            trackId: body.trackId,
          },
        },
      });

      return { active: false };
    }

    await this.prisma.favoriteTrack.create({
      data: {
        userId: request.user.id,
        trackId: body.trackId,
      },
    });

    return { active: true };
  }
}
