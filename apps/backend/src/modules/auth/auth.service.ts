import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { User, UserRole } from '@prisma/client';
import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash } from 'crypto';
import { promisify } from 'util';
import sharp from 'sharp';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';

const scrypt = promisify(scryptCallback);
export const SESSION_COOKIE_NAME = 'vinyl_session';

type CookieResponse = {
  cookie: (name: string, value: string, options: Record<string, unknown>) => void;
  clearCookie: (name: string, options: Record<string, unknown>) => void;
};

type CookieRequest = {
  headers?: {
    cookie?: string;
  };
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly storageService: StorageService,
  ) {}

  async register(input: {
    email: string;
    password: string;
    displayName: string;
    inviteCode?: string;
  }, response?: CookieResponse) {
    const userInviteCode = this.configService.get<string>('REGISTRATION_INVITE_CODE');
    const adminInviteCode = this.configService.get<string>('REGISTRATION_INVITE_CODE_ADMIN');
    const normalizedInviteCode = input.inviteCode?.trim();
    const matchedAdminCode = Boolean(adminInviteCode && normalizedInviteCode === adminInviteCode);
    const matchedUserCode = Boolean(userInviteCode && normalizedInviteCode === userInviteCode);

    if (!matchedAdminCode && !matchedUserCode) {
      throw new BadRequestException('Invalid invite code');
    }

    const email = input.email.trim().toLowerCase();
    const displayName = input.displayName.trim();
    if (!email || !displayName || input.password.length < 8) {
      throw new BadRequestException('Email, name and password with 8+ characters are required');
    }

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new BadRequestException('User already exists');
    }

    const user = await this.prisma.user.create({
      data: {
        email,
        displayName,
        passwordHash: await this.hashPassword(input.password),
        role: matchedAdminCode ? UserRole.ADMIN : UserRole.USER,
      },
    });

    if (response) {
      const token = await this.createSession(user.id);
      this.setSessionCookie(response, token);
    }

    return this.signAvatarUrl(this.toPublicUser(user));
  }

  async login(input: { email: string; password: string }, response: CookieResponse) {
    const email = input.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user?.passwordHash || !(await this.verifyPassword(input.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const token = await this.createSession(user.id);
    this.setSessionCookie(response, token);
    return this.signAvatarUrl(this.toPublicUser(user));
  }

  async logout(request: CookieRequest, response: CookieResponse) {
    const token = this.readSessionToken(request);
    if (token) {
      await this.prisma.session.deleteMany({
        where: {
          tokenHash: this.hashToken(token),
        },
      });
    }

    response.clearCookie(SESSION_COOKIE_NAME, this.getCookieOptions());
    return { ok: true };
  }

  async getUserFromRequest(request: CookieRequest) {
    const token = this.readSessionToken(request);
    if (!token) {
      return null;
    }

    const session = await this.prisma.session.findUnique({
      where: {
        tokenHash: this.hashToken(token),
      },
      include: {
        user: true,
      },
    });

    if (!session || session.expiresAt < new Date()) {
      if (session) {
        await this.prisma.session.delete({ where: { id: session.id } });
      }
      return null;
    }

    return session.user;
  }

  async me(request: CookieRequest) {
    const user = await this.getUserFromRequest(request);
    return user ? this.signAvatarUrl(this.toPublicUser(user)) : null;
  }

  async stats(user: User) {
    const collectionUserId = user.role === UserRole.ADMIN ? 'default-user' : user.id;
    const [releasesCount, tracksCount, playlistsCount] = await Promise.all([
      this.prisma.collectionItem.count({
        where: {
          userId: collectionUserId,
        },
      }),
      this.prisma.track.count({
        where: {
          release: {
            collectionItems: {
              some: {
                userId: collectionUserId,
              },
            },
          },
        },
      }),
      this.prisma.playlist.count({
        where: {
          userId: user.id,
        },
      }),
    ]);

    return {
      releasesCount,
      tracksCount,
      playlistsCount,
    };
  }

  async uploadAvatar(user: User, file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Avatar file is required');
    }

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      throw new BadRequestException('Avatar must be jpeg, png or webp');
    }

    const bucket = this.getAvatarBucket();
    const previousStorageKey = user.avatarStorageKey;
    const storageKey = this.storageService.getAvatarKey(user.id);
    const body = await sharp(file.buffer)
      .rotate()
      .resize(512, 512, { fit: 'cover' })
      .webp({ quality: 84 })
      .toBuffer();
    const avatarStorageUrl = await this.storageService.uploadObject({
      bucket,
      key: storageKey,
      body,
      contentType: 'image/webp',
    });

    const updatedUser = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        avatarStorageKey: storageKey,
        avatarStorageUrl,
      },
    });

    if (previousStorageKey && previousStorageKey !== storageKey) {
      try {
        await this.storageService.deleteObject(bucket, previousStorageKey);
      } catch {
        // Ignore stale avatar cleanup errors.
      }
    }

    return this.signAvatarUrl(this.toPublicUser(updatedUser));
  }

  async signAvatarUrl<T extends { avatarStorageKey?: string | null; avatarStorageUrl?: string | null }>(
    user: T,
  ) {
    const bucket = this.getAvatarBucket();
    return {
      ...user,
      avatarStorageUrl: user.avatarStorageKey
        ? (await this.storageService.getSignedObjectUrl(bucket, user.avatarStorageKey)) ||
          user.avatarStorageUrl
        : user.avatarStorageUrl,
    };
  }

  toPublicUser(user: User) {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      discogsUsername: user.discogsUsername,
      role: user.role,
      avatarStorageKey: user.avatarStorageKey,
      avatarStorageUrl: user.avatarStorageUrl,
      createdAt: user.createdAt,
    };
  }

  private async hashPassword(password: string) {
    const salt = randomBytes(16).toString('hex');
    const hash = (await scrypt(password, salt, 64)) as Buffer;
    return `${salt}:${hash.toString('hex')}`;
  }

  private async verifyPassword(password: string, storedHash: string) {
    const [salt, hash] = storedHash.split(':');
    if (!salt || !hash) {
      return false;
    }

    const candidate = (await scrypt(password, salt, 64)) as Buffer;
    const expected = Buffer.from(hash, 'hex');
    return expected.length === candidate.length && timingSafeEqual(expected, candidate);
  }

  private async createSession(userId: string) {
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);
    await this.prisma.session.create({
      data: {
        userId,
        tokenHash: this.hashToken(token),
        expiresAt,
      },
    });
    return token;
  }

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private setSessionCookie(response: CookieResponse, token: string) {
    response.cookie(SESSION_COOKIE_NAME, token, this.getCookieOptions());
  }

  private getAvatarBucket() {
    const avatarBucket = this.configService.get<string>('SELECTEL_S3_BUCKET_AVATARS')?.trim();
    if (avatarBucket) {
      return avatarBucket;
    }

    return this.configService.get<string>('SELECTEL_S3_BUCKET_COVERS')?.trim() || 'covers';
  }

  private getCookieOptions() {
    return {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.configService.get<string>('NODE_ENV') === 'production',
      path: '/',
      maxAge: 1000 * 60 * 60 * 24 * 30,
    };
  }

  private readSessionToken(request: CookieRequest) {
    const rawCookie = request.headers?.cookie;
    if (!rawCookie) {
      return null;
    }

    return (
      rawCookie
        .split(';')
        .map((part) => part.trim())
        .find((part) => part.startsWith(`${SESSION_COOKIE_NAME}=`))
        ?.split('=')
        .slice(1)
        .join('=') || null
    );
  }
}
