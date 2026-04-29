import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { parseBuffer } from 'music-metadata';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { UploadAudioBodyDto } from './dto/upload-audio.dto';

const execFileAsync = promisify(execFile);

type BackfillStatus = {
  id: string | null;
  status: 'idle' | 'running' | 'completed' | 'failed';
  total: number;
  processed: number;
  updated: number;
  waveformUpdated: number;
  skipped: number;
  failed: number;
  error?: string;
};

type BackfillProgress = Omit<BackfillStatus, 'id' | 'status' | 'error'>;

@Injectable()
export class AudioService {
  private backfillStatus: BackfillStatus = {
    id: null,
    status: 'idle',
    total: 0,
    processed: 0,
    updated: 0,
    waveformUpdated: 0,
    skipped: 0,
    failed: 0,
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    private readonly configService: ConfigService,
  ) {}

  private formatDuration(seconds: number) {
    const totalSeconds = Math.max(0, Math.round(seconds));
    const minutes = Math.floor(totalSeconds / 60);
    const remainingSeconds = totalSeconds % 60;
    return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
  }

  private buildWaveformData(buffer: Buffer, points = 180) {
    if (!buffer.length) {
      return [];
    }

    const startOffset =
      buffer.subarray(0, 3).toString('latin1') === 'ID3' && buffer.length >= 10
        ? Math.min(
            buffer.length,
            10 +
              ((buffer[6] & 0x7f) << 21) +
              ((buffer[7] & 0x7f) << 14) +
              ((buffer[8] & 0x7f) << 7) +
              (buffer[9] & 0x7f),
          )
        : 0;
    const audioBuffer = buffer.subarray(startOffset);
    const chunkSize = Math.max(1, Math.floor(audioBuffer.length / points));
    const peaks: number[] = [];

    for (let point = 0; point < points; point += 1) {
      const start = point * chunkSize;
      const end = Math.min(audioBuffer.length, start + chunkSize);
      let sum = 0;
      let max = 0;

      for (let index = start; index < end; index += 1) {
        const value = Math.abs(audioBuffer[index] - 128) / 128;
        sum += value;
        max = Math.max(max, value);
      }

      const average = end > start ? sum / (end - start) : 0;
      peaks.push(Math.min(1, Math.max(0.04, average * 0.55 + max * 0.45)));
    }

    const maxPeak = Math.max(...peaks, 0.01);
    return peaks.map((peak) => Number(Math.min(1, peak / maxPeak).toFixed(3)));
  }

  private buildWaveformDataFromPcm(buffer: Buffer, points = 180) {
    if (buffer.length < 4) {
      return [];
    }

    const sampleCount = Math.floor(buffer.length / 4);
    if (!sampleCount) {
      return [];
    }

    const chunkSize = Math.max(1, Math.floor(sampleCount / points));
    const peaks: number[] = [];

    for (let point = 0; point < points; point += 1) {
      const startSample = point * chunkSize;
      const endSample = Math.min(sampleCount, startSample + chunkSize);
      if (startSample >= sampleCount) {
        peaks.push(0.04);
        continue;
      }

      let sumSquares = 0;
      let max = 0;

      for (let sampleIndex = startSample; sampleIndex < endSample; sampleIndex += 1) {
        const value = Math.abs(buffer.readFloatLE(sampleIndex * 4));
        sumSquares += value * value;
        max = Math.max(max, value);
      }

      const length = Math.max(1, endSample - startSample);
      const rms = Math.sqrt(sumSquares / length);
      peaks.push(Math.min(1, Math.max(0.04, rms * 0.72 + max * 0.28)));
    }

    const maxPeak = Math.max(...peaks, 0.01);
    return peaks.map((peak) => Number(Math.min(1, peak / maxPeak).toFixed(3)));
  }

  private async generateWaveformData(buffer: Buffer, mimeType: string, points = 180) {
    if (!buffer.length) {
      return [];
    }

    const tempDir = await fs.mkdtemp(join(tmpdir(), 'vinyl-waveform-'));
    const sourcePath = join(tempDir, mimeType === 'audio/mpeg' || mimeType === 'audio/mp3' ? 'source.mp3' : 'source');
    const pcmPath = join(tempDir, 'waveform.pcm');

    try {
      await fs.writeFile(sourcePath, buffer);
      await execFileAsync('ffmpeg', [
        '-v',
        'error',
        '-i',
        sourcePath,
        '-f',
        'f32le',
        '-ac',
        '1',
        '-ar',
        '8000',
        pcmPath,
      ]);

      const pcmBuffer = await fs.readFile(pcmPath);
      const waveform = this.buildWaveformDataFromPcm(pcmBuffer, points);
      return waveform.length ? waveform : this.buildWaveformData(buffer, points);
    } catch {
      return this.buildWaveformData(buffer, points);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  }

  private detectMp3DurationFromFrames(buffer: Buffer) {
    const mpeg1Bitrates: Record<number, number[]> = {
      1: [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448],
      2: [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384],
      3: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
    };
    const mpeg2Bitrates: Record<number, number[]> = {
      1: [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256],
      2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
      3: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
    };
    const sampleRates: Record<number, number[]> = {
      0: [11025, 12000, 8000],
      2: [22050, 24000, 16000],
      3: [44100, 48000, 32000],
    };

    let offset = 0;
    if (buffer.subarray(0, 3).toString('latin1') === 'ID3' && buffer.length >= 10) {
      offset =
        10 +
        ((buffer[6] & 0x7f) << 21) +
        ((buffer[7] & 0x7f) << 14) +
        ((buffer[8] & 0x7f) << 7) +
        (buffer[9] & 0x7f);
    }

    let seconds = 0;
    let frames = 0;

    while (offset + 4 < buffer.length) {
      if (buffer[offset] !== 0xff || (buffer[offset + 1] & 0xe0) !== 0xe0) {
        offset += 1;
        continue;
      }

      const version = (buffer[offset + 1] >> 3) & 0x03;
      const layerBits = (buffer[offset + 1] >> 1) & 0x03;
      const bitrateIndex = (buffer[offset + 2] >> 4) & 0x0f;
      const sampleRateIndex = (buffer[offset + 2] >> 2) & 0x03;
      const padding = (buffer[offset + 2] >> 1) & 0x01;

      if (
        version === 1 ||
        layerBits === 0 ||
        bitrateIndex === 0 ||
        bitrateIndex === 15 ||
        sampleRateIndex === 3
      ) {
        offset += 1;
        continue;
      }

      const layer = 4 - layerBits;
      const bitrateTable = version === 3 ? mpeg1Bitrates : mpeg2Bitrates;
      const bitrate = bitrateTable[layer]?.[bitrateIndex] * 1000;
      const sampleRate = sampleRates[version]?.[sampleRateIndex];

      if (!bitrate || !sampleRate) {
        offset += 1;
        continue;
      }

      const samplesPerFrame = layer === 1 ? 384 : layer === 3 && version !== 3 ? 576 : 1152;
      const frameLength =
        layer === 1
          ? Math.floor((12 * bitrate) / sampleRate + padding) * 4
          : Math.floor(((layer === 3 && version !== 3 ? 72 : 144) * bitrate) / sampleRate + padding);

      if (frameLength <= 4 || offset + frameLength > buffer.length + 4096) {
        offset += 1;
        continue;
      }

      seconds += samplesPerFrame / sampleRate;
      frames += 1;
      offset += frameLength;
    }

    return frames > 10 && seconds > 0 ? seconds : null;
  }

  private async detectDurationFromBuffer(buffer: Buffer, mimeType: string, size?: number) {
    try {
      const metadata = await parseBuffer(buffer, {
        mimeType,
        size: size ?? buffer.byteLength,
      });
      const duration = metadata.format.duration;

      if (typeof duration === 'number' && Number.isFinite(duration) && duration > 0) {
        return {
          durationSec: Math.round(duration),
          durationRaw: this.formatDuration(duration),
        };
      }
    } catch {
      const duration = this.detectMp3DurationFromFrames(buffer);
      return duration
        ? {
            durationSec: Math.round(duration),
            durationRaw: this.formatDuration(duration),
          }
        : null;
    }

    const duration = this.detectMp3DurationFromFrames(buffer);
    if (duration) {
      return {
        durationSec: Math.round(duration),
        durationRaw: this.formatDuration(duration),
      };
    }

    return null;
  }

  async uploadAudio(file: Express.Multer.File, body: UploadAudioBodyDto) {
    if (!['audio/mpeg', 'audio/mp3'].includes(file.mimetype)) {
      throw new BadRequestException('Поддерживаются только MP3');
    }

    const track = await this.prisma.track.findUnique({
      where: {
        id: body.trackId,
      },
      include: {
        release: true,
      },
    });

    if (!track) {
      throw new BadRequestException('Трек не найден');
    }

    const userId = body.userId || 'default-user';
    await this.prisma.user.upsert({
      where: { id: userId },
      create: {
        id: userId,
        displayName: 'Моя коллекция',
      },
      update: {},
    });

    const key = this.storageService.getAudioKey({
      userId,
      releaseId: track.releaseId,
      trackId: track.id,
      fileName: file.originalname,
    });
    const bucket = this.configService.get<string>('SELECTEL_S3_BUCKET_AUDIO') || 'audio';
    const url = await this.storageService.uploadObject({
      bucket,
      key,
      body: file.buffer,
      contentType: file.mimetype,
    });

    const detectedDuration = await this.detectDurationFromBuffer(
      Buffer.from(file.buffer),
      file.mimetype,
      file.size,
    );
    const detectedDurationSec = detectedDuration?.durationSec ?? null;
    const detectedDurationRaw = detectedDuration?.durationRaw ?? null;

    const waveformData = await this.generateWaveformData(
      Buffer.from(file.buffer),
      file.mimetype,
    );

    await this.prisma.track.update({
      where: { id: track.id },
      data: {
        durationSec: detectedDurationSec ?? track.durationSec,
        durationRaw: detectedDurationRaw ?? track.durationRaw,
        waveformData,
      },
    });

    return this.prisma.audioFile.create({
      data: {
        userId,
        trackId: track.id,
        originalName: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        storageKey: key,
        storageUrl: url,
        acquiredLegally: true,
      },
    });
  }

  async deleteAudio(id: string) {
    const audio = await this.prisma.audioFile.findUnique({ where: { id } });
    if (!audio) {
      throw new BadRequestException('Аудиофайл не найден');
    }

    const bucket = this.configService.get<string>('SELECTEL_S3_BUCKET_AUDIO') || 'audio';
    await this.storageService.deleteObject(bucket, audio.storageKey);
    await this.prisma.audioFile.delete({ where: { id } });

    return { deleted: true };
  }

  async startBackfillDurations() {
    if (this.backfillStatus.status === 'running') {
      return this.backfillStatus;
    }

    const id = Date.now().toString(36);
    this.backfillStatus = {
      id,
      status: 'running',
      total: 0,
      processed: 0,
      updated: 0,
      waveformUpdated: 0,
      skipped: 0,
      failed: 0,
    };

    void this.backfillDurations((status) => {
      this.backfillStatus = {
        ...this.backfillStatus,
        ...status,
        id,
        status: 'running',
      };
    })
      .then((result) => {
        this.backfillStatus = {
          id,
          status: 'completed',
          total: result.processed,
          processed: result.processed,
          updated: result.updated,
          waveformUpdated: result.waveformUpdated,
          skipped: result.skipped,
          failed: result.failed,
        };
      })
      .catch((error) => {
        this.backfillStatus = {
          ...this.backfillStatus,
          id,
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      });

    return this.backfillStatus;
  }

  getBackfillDurationsStatus() {
    return this.backfillStatus;
  }

  async backfillDurations(
    onProgress?: (status: BackfillProgress) => void,
  ) {
    const tracks = await this.prisma.track.findMany({
      where: {
        audioFiles: {
          some: {},
        },
      },
      include: {
        audioFiles: {
          orderBy: {
            createdAt: 'desc',
          },
        },
      },
    });

    let updated = 0;
    let waveformUpdated = 0;
    let skipped = 0;
    let failed = 0;
    let processed = 0;
    const emitProgress = () =>
      onProgress?.({
        total: tracks.length,
        processed,
        updated,
        waveformUpdated,
        skipped,
        failed,
      });

    emitProgress();

    for (const track of tracks) {
      const audioFile = track.audioFiles[0];

      if (!audioFile) {
        skipped += 1;
        processed += 1;
        emitProgress();
        continue;
      }

      try {
        const bucket = this.configService.get<string>('SELECTEL_S3_BUCKET_AUDIO') || 'audio';
        const url = await this.storageService.getSignedObjectUrl(bucket, audioFile.storageKey);
        if (!url) {
          failed += 1;
          processed += 1;
          emitProgress();
          continue;
        }

        const response = await fetch(url);

        if (!response.ok) {
          failed += 1;
          processed += 1;
          emitProgress();
          continue;
        }

        const arrayBuffer = await response.arrayBuffer();
        const waveformData = await this.generateWaveformData(
          Buffer.from(arrayBuffer),
          audioFile.mimeType || 'audio/mpeg',
        );
        const detectedDuration = await this.detectDurationFromBuffer(
          Buffer.from(arrayBuffer),
          audioFile.mimeType || 'audio/mpeg',
          audioFile.sizeBytes || undefined,
        );

        if (!detectedDuration && !waveformData.length) {
          skipped += 1;
          processed += 1;
          emitProgress();
          continue;
        }

        await this.prisma.track.update({
          where: { id: track.id },
          data: {
            durationSec: detectedDuration?.durationSec ?? track.durationSec,
            durationRaw: detectedDuration?.durationRaw ?? track.durationRaw,
            ...(waveformData.length ? { waveformData } : {}),
          },
        });
        if (detectedDuration) {
          updated += 1;
        }
        if (waveformData.length) {
          waveformUpdated += 1;
        }
        processed += 1;
        emitProgress();
      } catch {
        failed += 1;
        processed += 1;
        emitProgress();
      }
    }

    return {
      processed,
      updated,
      waveformUpdated,
      skipped,
      failed,
    };
  }
}
