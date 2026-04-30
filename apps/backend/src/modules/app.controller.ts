import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from './auth/auth.guards';
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
  async users() {
    return this.prisma.user.findMany({
      orderBy: {
        createdAt: 'asc',
      },
      select: {
        id: true,
        email: true,
        displayName: true,
        discogsUsername: true,
        role: true,
        avatarStorageUrl: true,
        createdAt: true,
        _count: {
          select: {
            collectionItems: true,
            playlists: true,
            audioFiles: true,
          },
        },
      },
    });
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
              (await this.storageService.getSignedObjectUrl(audioBucket, audioFile.storageKey)) ||
              audioFile.storageUrl,
          })),
        ),
      })),
    );
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
