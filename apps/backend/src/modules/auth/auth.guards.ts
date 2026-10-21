import { CanActivate, ExecutionContext, Injectable, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    const user = await this.authService.getUserFromRequest(request);
    if (!user) {
      throw new UnauthorizedException('Authentication required');
    }

    request.user = user;
    return true;
  }
}

@Injectable()
export class PlaybackGuard implements CanActivate {
  constructor(private readonly authService: AuthService, private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    const user = await this.authService.getUserFromRequest(request);
    if (!user) {
      const settings = await this.authService.getAuthSettings();
      const track = await this.prisma.track.findUnique({
        where: { id: request.params.id },
        select: { release: { select: { isMix: true, isOriginal: true } } },
      });
      const allowed = track?.release.isOriginal || (track?.release.isMix ? settings.allowGuestMixPlayback : !settings.playbackRequiresRegistration);
      if (!track || !allowed) {
        throw new UnauthorizedException('Authentication required for playback');
      }
    }
    request.user = user;
    return true;
  }
}

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    request.securityAuditAdmin = true;
    const user = await this.authService.getUserFromRequest(request);
    request.user = user;
    if (!user) {
      throw new UnauthorizedException('Authentication required');
    }

    if (user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Admin role required');
    }

    request.user = user;
    return true;
  }
}
