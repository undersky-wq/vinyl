const { GetObjectCommand, S3Client } = require('@aws-sdk/client-s3');
const { PrismaClient } = require('@prisma/client');
const { createWriteStream } = require('node:fs');
const { mkdir, rename, stat, unlink } = require('node:fs/promises');
const path = require('node:path');
const { pipeline } = require('node:stream/promises');

const prisma = new PrismaClient();

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required for S3 migration`);
  }
  return value;
}

function normalizeEndpoint(value) {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

async function exists(filePath) {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
}

async function downloadObject(client, item, filePath) {
  let lastError;
  const maxAttempts = 5;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const partPath = `${filePath}.part`;
    let timeout;
    const resetTimeout = () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => controller.abort(), 30_000);
    };
    try {
      resetTimeout();
      const result = await client.send(
        new GetObjectCommand({ Bucket: item.bucket, Key: item.key }),
        { abortSignal: controller.signal },
      );
      if (!result.Body) throw new Error('Empty S3 response body');
      await mkdir(path.dirname(filePath), { recursive: true });
      result.Body.on('data', resetTimeout);
      await pipeline(result.Body, createWriteStream(partPath), {
        signal: controller.signal,
      });
      await rename(partPath, filePath);
      return;
    } catch (error) {
      lastError = error;
      await unlink(partPath).catch(() => {});
      if (attempt < maxAttempts) {
        const delayMs = attempt * 10_000;
        console.warn(`Retry ${attempt}/${maxAttempts} in ${delayMs / 1000}s for ${item.bucket}/${item.key}`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError;
}

async function main() {
  const endpoint = normalizeEndpoint(required('SELECTEL_S3_ENDPOINT'));
  const client = new S3Client({
    endpoint,
    region: process.env.SELECTEL_S3_REGION || 'ru-1',
    forcePathStyle: true,
    credentials: {
      accessKeyId: required('SELECTEL_S3_ACCESS_KEY'),
      secretAccessKey: required('SELECTEL_S3_SECRET_KEY'),
    },
  });
  const root = path.resolve(process.env.LOCAL_STORAGE_PATH || '/data/storage');
  const buckets = {
    audio: process.env.SELECTEL_S3_BUCKET_AUDIO || 'audio',
    covers: process.env.SELECTEL_S3_BUCKET_COVERS || 'covers',
    avatars: process.env.SELECTEL_S3_BUCKET_AVATARS || 'avatars',
  };

  const [releases, images, audioFiles, users] = await Promise.all([
    prisma.release.findMany({
      select: {
        coverStorageKey: true,
        coverThumbStorageKey: true,
        coverMediumStorageKey: true,
      },
    }),
    prisma.image.findMany({ select: { storageKey: true } }),
    prisma.audioFile.findMany({
      select: { storageKey: true, normalizedStorageKey: true },
    }),
    prisma.user.findMany({ select: { avatarStorageKey: true } }),
  ]);

  const objects = new Map();
  const add = (bucket, key) => {
    if (key) objects.set(`${bucket}:${key}`, { bucket, key });
  };

  for (const release of releases) {
    add(buckets.covers, release.coverStorageKey);
    add(buckets.covers, release.coverThumbStorageKey);
    add(buckets.covers, release.coverMediumStorageKey);
  }
  for (const image of images) add(buckets.covers, image.storageKey);
  for (const audio of audioFiles) {
    add(buckets.audio, audio.storageKey);
    add(buckets.audio, audio.normalizedStorageKey);
  }
  for (const user of users) add(buckets.avatars, user.avatarStorageKey);

  const queue = [...objects.values()];
  let downloaded = 0;
  let skipped = 0;
  let failed = 0;
  let cursor = 0;

  async function worker() {
    while (cursor < queue.length) {
      const item = queue[cursor++];
      const filePath = path.resolve(root, item.key);
      if (!filePath.startsWith(`${root}${path.sep}`)) {
        console.error(`Invalid storage key: ${item.key}`);
        failed++;
        continue;
      }
      if (await exists(filePath)) {
        skipped++;
        continue;
      }

      try {
        await downloadObject(client, item, filePath);
        downloaded++;
        if (downloaded % 25 === 0) {
          console.log(`Downloaded ${downloaded}/${queue.length}`);
        }
      } catch (error) {
        failed++;
        console.error(`Failed ${item.bucket}/${item.key}: ${error.message}`);
      }
    }
  }

  console.log(`Found ${queue.length} unique objects in PostgreSQL`);
  await Promise.all(Array.from({ length: 3 }, () => worker()));
  console.log(`Migration finished: downloaded=${downloaded}, skipped=${skipped}, failed=${failed}`);
  return failed;
}

async function runUntilComplete() {
  while (true) {
    const failed = await main();
    if (failed === 0) {
      console.log('All S3 objects are available locally');
      return;
    }
    const retryDelayMs = Number(process.env.MIGRATION_RETRY_DELAY_MS || 300_000);
    console.log(`Retrying ${failed} failed objects in ${Math.round(retryDelayMs / 1000)}s`);
    await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
  }
}

runUntilComplete()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
