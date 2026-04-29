import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from './auth/auth.guards';
import { PrismaService } from './prisma/prisma.service';

@Controller()
export class AppController {
  constructor(private readonly prisma: PrismaService) {}

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
