import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { StorageService } from './storage.service';
import { AuthService } from '../auth/auth.service';

@Controller('media')
export class StorageController {
  constructor(private readonly storageService: StorageService, private readonly authService: AuthService) {}

  @Get(':bucket/*')
  async streamLocalObject(
    @Param('bucket') bucket: string,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const key = decodeURIComponent(String(request.params[0] || ''));
    if (!this.storageService.isLocalBucket(bucket)) {
      // Never expose audio, avatars, or arbitrary buckets through this public
      // redirect. Covers already have public visibility in the release APIs.
      if (!this.storageService.isPublicCoverObject(bucket, key)) throw new NotFoundException();
      const url = await this.storageService.getTemporaryObjectUrl(bucket, key);
      if (!url) throw new NotFoundException();
      // A cached redirect would recreate the expired-signature problem.
      response.setHeader('Cache-Control', 'no-store, max-age=0');
      response.redirect(302, url);
      return;
    }
    if (path.extname(key).toLowerCase() === '.mp3') {
      const settings = await this.authService.getAuthSettings();
      if (settings.playbackRequiresRegistration && !await this.authService.getUserFromRequest(request)) {
        throw new UnauthorizedException('Authentication required for playback');
      }
    }
    let filePath: string;

    try {
      filePath = this.storageService.resolveLocalObjectPath(bucket, key);
    } catch {
      throw new NotFoundException();
    }

    let fileStat;
    try {
      fileStat = await stat(filePath);
    } catch {
      throw new NotFoundException();
    }

    if (!fileStat.isFile()) {
      throw new NotFoundException();
    }

    const contentTypes: Record<string, string> = {
      '.avif': 'image/avif',
      '.gif': 'image/gif',
      '.jpeg': 'image/jpeg',
      '.jpg': 'image/jpeg',
      '.mp3': 'audio/mpeg',
      '.png': 'image/png',
      '.webp': 'image/webp',
    };
    const contentType = contentTypes[path.extname(filePath).toLowerCase()]
      || 'application/octet-stream';
    const range = request.headers.range;

    response.setHeader('Accept-Ranges', 'bytes');
    response.setHeader('Content-Type', contentType);
    response.setHeader('Cache-Control', 'private, max-age=3600');

    if (!range) {
      response.setHeader('Content-Length', fileStat.size);
      createReadStream(filePath).pipe(response);
      return;
    }

    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match) {
      response.status(416).setHeader('Content-Range', `bytes */${fileStat.size}`);
      response.end();
      return;
    }

    const start = match[1] ? Number(match[1]) : 0;
    const end = match[2] ? Number(match[2]) : fileStat.size - 1;
    if (start > end || start >= fileStat.size || end >= fileStat.size) {
      response.status(416).setHeader('Content-Range', `bytes */${fileStat.size}`);
      response.end();
      return;
    }

    response.status(206);
    response.setHeader('Content-Range', `bytes ${start}-${end}/${fileStat.size}`);
    response.setHeader('Content-Length', end - start + 1);
    createReadStream(filePath, { start, end }).pipe(response);
  }
}
