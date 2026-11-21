import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
  UseGuards,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { AudioService } from './audio.service';
import { UploadAudioBodyDto } from './dto/upload-audio.dto';
import { AdminGuard } from '../auth/auth.guards';

const MAX_AUDIO_UPLOAD_BYTES = 500 * 1024 * 1024;

@Controller('audio')
export class AudioController {
  constructor(private readonly audioService: AudioService) {}

  @Post('upload')
  @UseGuards(AdminGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: {
        fileSize: MAX_AUDIO_UPLOAD_BYTES,
      },
    }),
  )
  upload(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: UploadAudioBodyDto,
  ) {
    if (!file) {
      throw new BadRequestException('Файл обязателен');
    }

    return this.audioService.uploadAudio(file, body);
  }

  @Delete(':id')
  @UseGuards(AdminGuard)
  remove(@Param('id') id: string) {
    return this.audioService.deleteAudio(id);
  }

  @Post('tracks/:trackId/source-search/:source')
  @UseGuards(AdminGuard)
  findSourceMatches(@Param('trackId') trackId: string, @Param('source') source: string) {
    return this.audioService.findSourceMatches(trackId, source);
  }

  @Post('tracks/:trackId/source-import/:matchId')
  @UseGuards(AdminGuard)
  importSourceMatch(@Param('trackId') trackId: string, @Param('matchId') matchId: string) {
    return this.audioService.startSourceImport(trackId, matchId);
  }

  @Get('tracks/:trackId/source-import/:jobId')
  @UseGuards(AdminGuard)
  sourceImportStatus(@Param('trackId') trackId: string, @Param('jobId') jobId: string) {
    return this.audioService.getSourceImportStatus(trackId, jobId);
  }

  @Post('backfill-durations')
  @UseGuards(AdminGuard)
  backfillDurations() {
    return this.audioService.backfillDurations();
  }

  @Post('backfill-durations/start')
  @UseGuards(AdminGuard)
  startBackfillDurations() {
    return this.audioService.startBackfillDurations();
  }

  @Get('backfill-durations/status')
  @UseGuards(AdminGuard)
  backfillDurationsStatus() {
    return this.audioService.getBackfillDurationsStatus();
  }

  @Post('normalize/start')
  @UseGuards(AdminGuard)
  startNormalizeAudio() {
    return this.audioService.startNormalizeAudio();
  }

  @Post('normalize/clear')
  @UseGuards(AdminGuard)
  clearNormalizeAudio() {
    return this.audioService.clearNormalizedAudioFiles();
  }

  @Get('normalize/status')
  @UseGuards(AdminGuard)
  normalizeAudioStatus() {
    return this.audioService.getNormalizeAudioStatus();
  }
}
