import { BadGatewayException, BadRequestException, ConflictException, HttpException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { parseBuffer } from 'music-metadata';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { UploadAudioBodyDto } from './dto/upload-audio.dto';
import { waveformFromPcm } from './waveform-data';

const execFileAsync = promisify(execFile);
const SOURCE_MAX_BYTES = 50 * 1024 * 1024;
type AudioSource = 'youtube' | 'bandcamp';
type SourceMatch = {
  title: string;
  url: string;
  duration: number | null;
  score: number;
  media: { id: string | number; bandId?: number };
};

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

type NormalizeStatus = {
  id: string | null;
  status: 'idle' | 'running' | 'completed' | 'failed';
  total: number;
  processed: number;
  normalized: number;
  skipped: number;
  failed: number;
  error?: string;
};

type NormalizeProgress = Omit<NormalizeStatus, 'id' | 'status' | 'error'>;

@Injectable()
export class AudioService {
  private readonly sourceMatches = new Map<string, {
    trackId: string; artist: string; title: string; source: AudioSource; match: SourceMatch; expires: number;
  }>();
  private readonly audioWrites = new Set<string>();
  private sourceWorkers = 0;
  private readonly sourceJobs = new Map<string, {
    trackId: string; status: 'running' | 'done' | 'failed'; error?: string;
  }>();
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

  private normalizeStatus: NormalizeStatus = {
    id: null,
    status: 'idle',
    total: 0,
    processed: 0,
    normalized: 0,
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

  private buildWaveformDataFromPcm(buffer: Buffer, points?: number) {
    return waveformFromPcm(buffer, points);
  }

  private async generateWaveformData(buffer: Buffer, mimeType: string, points?: number) {
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
      return waveform;
    } catch {
      // Compressed bytes are not amplitude data; keep the unavailable state explicit.
      return [];
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  }

  private async normalizeAudioBuffer(buffer: Buffer) {
    const tempDir = await fs.mkdtemp(join(tmpdir(), 'vinyl-normalize-'));
    const sourcePath = join(tempDir, 'source.mp3');
    const outputPath = join(tempDir, 'prepared.mp3');

    try {
      await fs.writeFile(sourcePath, buffer);
      await execFileAsync(
        'ffmpeg',
        [
          '-v',
          'error',
          '-err_detect',
          'ignore_err',
          '-i',
          sourcePath,
          '-map',
          '0:a:0',
          '-vn',
          '-map_metadata',
          '-1',
          '-c:a',
          'copy',
          '-id3v2_version',
          '3',
          '-write_id3v1',
          '0',
          outputPath,
        ],
        {
          maxBuffer: 20 * 1024 * 1024,
        },
      );

      return fs.readFile(outputPath);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  }

  private detectMp3DurationFromFrames(buffer: Buffer) {
    // Container payloads can contain accidental MPEG sync bytes, not MP3 frames.
    if (buffer.subarray(4, 8).toString('latin1') === 'ftyp'
      || ['OggS', 'fLaC', 'RIFF'].includes(buffer.subarray(0, 4).toString('latin1'))
      || buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) return null;
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
    let streamFormat = '';

    while (offset + 4 < buffer.length) {
      if (buffer[offset] !== 0xff || (buffer[offset + 1] & 0xe0) !== 0xe0) {
        if (frames > 10) break;
        frames = 0; seconds = 0; streamFormat = '';
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
        layerBits !== 1 ||
        bitrateIndex === 0 ||
        bitrateIndex === 15 ||
        sampleRateIndex === 3
      ) {
        if (frames > 10) break;
        frames = 0; seconds = 0; streamFormat = '';
        offset += 1;
        continue;
      }

      const layer = 4 - layerBits;
      const bitrateTable = version === 3 ? mpeg1Bitrates : mpeg2Bitrates;
      const bitrate = bitrateTable[layer]?.[bitrateIndex] * 1000;
      const sampleRate = sampleRates[version]?.[sampleRateIndex];

      if (!bitrate || !sampleRate) {
        if (frames > 10) break;
        frames = 0; seconds = 0; streamFormat = '';
        offset += 1;
        continue;
      }

      const samplesPerFrame = layer === 1 ? 384 : layer === 3 && version !== 3 ? 576 : 1152;
      const frameLength =
        layer === 1
          ? Math.floor((12 * bitrate) / sampleRate + padding) * 4
          : Math.floor(((layer === 3 && version !== 3 ? 72 : 144) * bitrate) / sampleRate + padding);

      if (frameLength <= 4 || offset + frameLength > buffer.length) {
        if (frames > 10) break;
        frames = 0; seconds = 0; streamFormat = '';
        offset += 1;
        continue;
      }

      const format = `${version}:${layer}:${sampleRate}`;
      if (streamFormat && streamFormat !== format) {
        if (frames > 10) break;
        frames = 0; seconds = 0;
      }
      streamFormat = format;
      seconds += samplesPerFrame / sampleRate;
      frames += 1;
      offset += frameLength;
    }

    return frames > 10 && seconds > 0 ? seconds : null;
  }

  private async detectDurationFromBuffer(buffer: Buffer, _mimeType: string, _size?: number) {
    try {
      // Browser MIME types and file extensions may be wrong (for example M4A named .mp3).
      const metadata = await parseBuffer(buffer, { size: buffer.byteLength }, { duration: true });
      const duration = metadata.format.duration;

      if (typeof duration === 'number' && Number.isFinite(duration) && duration > 0) {
        return {
          durationSec: Math.round(duration),
          durationRaw: this.formatDuration(duration),
        };
      }
    } catch { /* Only a validated MP3 frame sequence may supply the fallback. */ }

    const duration = this.detectMp3DurationFromFrames(buffer);
    if (duration) {
      return {
        durationSec: Math.round(duration),
        durationRaw: this.formatDuration(duration),
      };
    }

    return null;
  }

  private async runTrackSource(action: 'search' | 'download', source: AudioSource, payload: object, path?: string) {
    if (this.sourceWorkers >= 2) {
      throw new ServiceUnavailableException('Поиск и загрузка заняты. Попробуйте чуть позже.');
    }
    this.sourceWorkers++;
    try {
      return await execFileAsync(
        process.env.TRACK_SOURCE_PYTHON || 'python',
        [join(process.cwd(), 'scripts', 'track-source.py'), action, source, JSON.stringify(payload), ...(path ? [path] : [])],
        { timeout: action === 'search' ? 25_000 : 180_000, maxBuffer: 512 * 1024, windowsHide: true },
      );
    } catch {
      throw new BadGatewayException('Источник не ответил или не предоставил аудио. Попробуйте позже.');
    } finally {
      this.sourceWorkers--;
    }
  }

  private async getEmptySourceTrack(trackId: string) {
    const track = await this.prisma.track.findUnique({
      where: { id: trackId },
      select: { title: true, artists: true, durationSec: true,
        release: { select: { artist: true } }, _count: { select: { audioFiles: true } } },
    });
    if (!track) throw new BadRequestException('Трек не найден');
    if (track._count.audioFiles) throw new ConflictException('У трека уже есть аудио.');
    return { title: track.title, artist: track.artists.filter(Boolean).join(', ') || track.release.artist,
      duration: track.durationSec };
  }

  async findSourceMatches(trackId: string, source: string) {
    if (source !== 'youtube' && source !== 'bandcamp') throw new BadRequestException('Неизвестный источник.');
    const track = await this.getEmptySourceTrack(trackId);
    const { stdout } = await this.runTrackSource('search', source, track);
    let matches: SourceMatch[];
    try {
      matches = JSON.parse(stdout) as SourceMatch[];
      if (!Array.isArray(matches)) throw new Error('Invalid search response');
    } catch {
      throw new BadGatewayException('Источник вернул некорректные результаты поиска.');
    }
    const now = Date.now();
    for (const [id, value] of this.sourceMatches) {
      if (value.expires <= now) this.sourceMatches.delete(id);
    }
    return matches.filter(match => match.score >= 75).slice(0, 5).map(match => {
      while (this.sourceMatches.size >= 300) {
        const oldest = this.sourceMatches.keys().next().value;
        if (!oldest) break;
        this.sourceMatches.delete(oldest);
      }
      const id = randomUUID();
      this.sourceMatches.set(id, { trackId, artist: track.artist, title: track.title, source, match, expires: now + 10 * 60_000 });
      return { id, title: match.title, url: match.url, duration: match.duration, score: match.score };
    });
  }

  startSourceImport(trackId: string, matchId: string) {
    const active = [...this.sourceJobs.values()].filter(job => job.status === 'running');
    if (active.some(job => job.trackId === trackId)) throw new ConflictException('Трек уже загружается.');
    if (active.length >= 2) throw new ServiceUnavailableException('Загрузка занята. Попробуйте чуть позже.');
    const id = randomUUID();
    const job: { trackId: string; status: 'running' | 'done' | 'failed'; error?: string } = { trackId, status: 'running' };
    this.sourceJobs.set(id, job);
    void this.importSourceMatch(trackId, matchId).then(() => {
      job.status = 'done';
    }).catch((error: unknown) => {
      job.status = 'failed';
      job.error = error instanceof HttpException ? error.message : 'Не удалось сохранить аудио.';
    }).finally(() => {
      setTimeout(() => this.sourceJobs.delete(id), 10 * 60_000).unref();
    });
    return { id };
  }

  getSourceImportStatus(trackId: string, id: string) {
    const job = this.sourceJobs.get(id);
    if (!job || job.trackId !== trackId) throw new BadRequestException('Загрузка не найдена. Проверьте, появилось ли аудио у трека.');
    return { status: job.status, error: job.error };
  }

  private async importSourceMatch(trackId: string, id: string) {
    const candidate = this.sourceMatches.get(id);
    if (!candidate || candidate.trackId !== trackId || candidate.expires <= Date.now()) {
      throw new BadRequestException('Результат поиска устарел. Повторите поиск.');
    }
    const track = await this.getEmptySourceTrack(trackId);
    if (track.title !== candidate.title || track.artist !== candidate.artist) {
      throw new ConflictException('Название или исполнитель изменились. Повторите поиск.');
    }
    const folder = await fs.mkdtemp(join(tmpdir(), 'vinyl-source-'));
    try {
      const base = join(folder, 'track');
      await this.runTrackSource('download', candidate.source, candidate.match.media, base);
      const path = base + '.mp3';
      const size = (await fs.stat(path).catch(() => null))?.size || 0;
      if (!size || size > SOURCE_MAX_BYTES) throw new BadGatewayException('Источник не предоставил MP3 до 50 МБ.');
      const buffer = await fs.readFile(path);
      const metadata = await parseBuffer(buffer, { mimeType: 'audio/mpeg', size }).catch(() => null);
      if (!metadata?.format.duration || !metadata.format.codec?.includes('Layer 3')) {
        throw new BadGatewayException('Полученный файл не содержит MP3-аудио.');
      }
      if (track.duration && Math.abs(metadata.format.duration - track.duration) > Math.max(20, track.duration * 0.15)) {
        throw new BadGatewayException('Длительность файла отличается от длительности трека.');
      }
      return await this.uploadAudio({
        mimetype: 'audio/mpeg', originalname: `${track.artist} - ${track.title}.mp3`, buffer, size,
      }, { trackId }, true);
    } finally {
      await fs.rm(folder, { recursive: true, force: true });
    }
  }

  async uploadAudio(file: Pick<Express.Multer.File, 'mimetype' | 'originalname' | 'buffer' | 'size'>, body: UploadAudioBodyDto, onlyIfEmpty = false) {
    if (this.audioWrites.has(body.trackId)) throw new ConflictException('Аудио этого трека уже загружается.');
    this.audioWrites.add(body.trackId);
    try {
      if (onlyIfEmpty) await this.getEmptySourceTrack(body.trackId);
      return await this.saveAudio(file, body);
    } finally {
      this.audioWrites.delete(body.trackId);
    }
  }

  private async saveAudio(file: Pick<Express.Multer.File, 'mimetype' | 'originalname' | 'buffer' | 'size'>, body: UploadAudioBodyDto) {
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
    const existingAudioFiles = await this.prisma.audioFile.findMany({
      where: { trackId: track.id },
      orderBy: { createdAt: 'asc' },
    });
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

    const reusableAudioFile =
      existingAudioFiles.find((audioFile) => audioFile.storageKey === key) || existingAudioFiles[0];

    if (reusableAudioFile) {
      const staleAudioFiles = existingAudioFiles.filter(
        (audioFile) => audioFile.id !== reusableAudioFile.id,
      );
      const staleStorageKeys = new Set(
        existingAudioFiles
          .flatMap((audioFile) => [
            audioFile.storageKey,
            audioFile.normalizedStorageKey,
          ])
          .filter((storageKey): storageKey is string => Boolean(storageKey) && storageKey !== key),
      );

      if (staleAudioFiles.length) {
        await this.prisma.audioFile.deleteMany({
          where: {
            id: {
              in: staleAudioFiles.map((audioFile) => audioFile.id),
            },
          },
        });
      }

      const updatedAudioFile = await this.prisma.audioFile.update({
        where: { id: reusableAudioFile.id },
        data: {
          userId,
          trackId: track.id,
          originalName: file.originalname,
          mimeType: file.mimetype,
          sizeBytes: file.size,
          storageKey: key,
          storageUrl: url,
          normalizedStorageKey: null,
          normalizedStorageUrl: null,
          normalizedMimeType: null,
          normalizedSizeBytes: null,
          normalizedAt: null,
          acquiredLegally: true,
        },
      });

      await Promise.all(
        [...staleStorageKeys].map(async (storageKey) => {
          try {
            await this.storageService.deleteObject(bucket, storageKey);
          } catch {
            // A missing stale object should not block replacing the current track audio.
          }
        }),
      );

      return updatedAudioFile;
    }

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
    if (audio.normalizedStorageKey) {
      try {
        await this.storageService.deleteObject(bucket, audio.normalizedStorageKey);
      } catch {
        // Original deletion remains the source of truth; a missing prepared copy should not block cleanup.
      }
    }
    await this.prisma.audioFile.delete({ where: { id } });

    return { deleted: true };
  }

  async startNormalizeAudio() {
    if (this.normalizeStatus.status === 'running') {
      return this.normalizeStatus;
    }

    const id = Date.now().toString(36);
    this.normalizeStatus = {
      id,
      status: 'running',
      total: 0,
      processed: 0,
      normalized: 0,
      skipped: 0,
      failed: 0,
    };

    void this.normalizeAudioFiles((status) => {
      this.normalizeStatus = {
        ...this.normalizeStatus,
        ...status,
        id,
        status: 'running',
      };
    })
      .then((result) => {
        this.normalizeStatus = {
          id,
          status: 'completed',
          total: result.processed,
          processed: result.processed,
          normalized: result.normalized,
          skipped: result.skipped,
          failed: result.failed,
        };
      })
      .catch((error) => {
        this.normalizeStatus = {
          ...this.normalizeStatus,
          id,
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      });

    return this.normalizeStatus;
  }

  getNormalizeAudioStatus() {
    return this.normalizeStatus;
  }

  async clearNormalizedAudioFiles() {
    const audioFiles = await this.prisma.audioFile.findMany({
      where: {
        normalizedStorageKey: {
          not: null,
        },
      },
      select: {
        id: true,
        normalizedStorageKey: true,
      },
    });
    const bucket = this.configService.get<string>('SELECTEL_S3_BUCKET_AUDIO') || 'audio';
    let deleted = 0;
    let failed = 0;

    for (const audioFile of audioFiles) {
      if (!audioFile.normalizedStorageKey) {
        continue;
      }

      try {
        await this.storageService.deleteObject(bucket, audioFile.normalizedStorageKey);
        deleted += 1;
      } catch {
        failed += 1;
      }
    }

    await this.prisma.audioFile.updateMany({
      where: {
        normalizedStorageKey: {
          not: null,
        },
      },
      data: {
        normalizedStorageKey: null,
        normalizedStorageUrl: null,
        normalizedMimeType: null,
        normalizedSizeBytes: null,
        normalizedAt: null,
      },
    });

    this.normalizeStatus = {
      id: null,
      status: 'idle',
      total: 0,
      processed: 0,
      normalized: 0,
      skipped: 0,
      failed: 0,
    };

    return {
      cleared: audioFiles.length,
      deleted,
      failed,
    };
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

  async normalizeAudioFiles(onProgress?: (status: NormalizeProgress) => void) {
    const audioFiles = await this.prisma.audioFile.findMany({
      where: {
        normalizedStorageKey: null,
      },
      include: {
        track: {
          include: {
            release: true,
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    let normalized = 0;
    let skipped = 0;
    let failed = 0;
    let processed = 0;
    const emitProgress = () =>
      onProgress?.({
        total: audioFiles.length,
        processed,
        normalized,
        skipped,
        failed,
      });

    emitProgress();

    for (const audioFile of audioFiles) {
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

        const originalBuffer = Buffer.from(await response.arrayBuffer());
        if (!originalBuffer.length) {
          skipped += 1;
          processed += 1;
          emitProgress();
          continue;
        }

        const normalizedBuffer = await this.normalizeAudioBuffer(originalBuffer);
        const normalizedKey = this.storageService.getAudioKey({
          userId: audioFile.userId,
          releaseId: audioFile.track.releaseId,
          trackId: audioFile.trackId,
          fileName: `normalized-${audioFile.id}.mp3`,
        });
        const normalizedUrl = await this.storageService.uploadObject({
          bucket,
          key: normalizedKey,
          body: normalizedBuffer,
          contentType: 'audio/mpeg',
        });
        const [detectedDuration, waveformData] = await Promise.all([
          this.detectDurationFromBuffer(normalizedBuffer, 'audio/mpeg', normalizedBuffer.length),
          this.generateWaveformData(normalizedBuffer, 'audio/mpeg'),
        ]);

        await this.prisma.$transaction([
          this.prisma.audioFile.update({
            where: { id: audioFile.id },
            data: {
              normalizedStorageKey: normalizedKey,
              normalizedStorageUrl: normalizedUrl,
              normalizedMimeType: 'audio/mpeg',
              normalizedSizeBytes: normalizedBuffer.length,
              normalizedAt: new Date(),
            },
          }),
          this.prisma.track.update({
            where: { id: audioFile.trackId },
            data: {
              durationSec: detectedDuration?.durationSec ?? audioFile.track.durationSec,
              durationRaw: detectedDuration?.durationRaw ?? audioFile.track.durationRaw,
              ...(waveformData.length ? { waveformData } : {}),
            },
          }),
        ]);

        normalized += 1;
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
      normalized,
      skipped,
      failed,
    };
  }
}
