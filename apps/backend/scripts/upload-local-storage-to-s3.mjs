import { createReadStream } from 'node:fs';
import { opendir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import {
  HeadBucketCommand,
  HeadObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..', '..', '..');
const sourceRoot = path.resolve(process.argv[2] || '');
const concurrency = Math.max(1, Number(process.env.UPLOAD_CONCURRENCY || 3));

if (!process.argv[2]) {
  throw new Error('Usage: node upload-local-storage-to-s3.mjs <storage-directory>');
}

function parseEnv(source) {
  const result = {};
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

const env = {
  ...parseEnv(await readFile(path.join(repoRoot, '.env'), 'utf8')),
  ...process.env,
};

for (const key of [
  'SELECTEL_S3_ENDPOINT',
  'SELECTEL_S3_ACCESS_KEY',
  'SELECTEL_S3_SECRET_KEY',
  'SELECTEL_S3_BUCKET_COVERS',
  'SELECTEL_S3_BUCKET_AUDIO',
]) {
  if (!env[key]) throw new Error(`Missing required environment variable: ${key}`);
}

const bucketByFolder = {
  audio: env.SELECTEL_S3_BUCKET_AUDIO,
  covers: env.SELECTEL_S3_BUCKET_COVERS,
  avatars:
    env.SELECTEL_S3_BUCKET_AVATARS || env.SELECTEL_S3_BUCKET_COVERS,
};

const endpoint = /^https?:\/\//i.test(env.SELECTEL_S3_ENDPOINT)
  ? env.SELECTEL_S3_ENDPOINT
  : `https://${env.SELECTEL_S3_ENDPOINT}`;

const client = new S3Client({
  endpoint,
  region: env.SELECTEL_S3_REGION || 'ru-1',
  credentials: {
    accessKeyId: env.SELECTEL_S3_ACCESS_KEY,
    secretAccessKey: env.SELECTEL_S3_SECRET_KEY,
  },
  forcePathStyle: env.SELECTEL_S3_FORCE_PATH_STYLE === 'true',
});

async function* walk(directory) {
  const entries = await opendir(directory);
  for await (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) yield* walk(fullPath);
    else if (entry.isFile()) yield fullPath;
  }
}

function contentType(filePath) {
  switch (path.extname(filePath).toLowerCase()) {
    case '.mp3':
      return 'audio/mpeg';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.webp':
      return 'image/webp';
    default:
      return 'application/octet-stream';
  }
}

const files = [];
for await (const filePath of walk(sourceRoot)) {
  const relativePath = path.relative(sourceRoot, filePath);
  const [topFolder] = relativePath.split(path.sep);
  const bucket = bucketByFolder[topFolder];
  if (!bucket) {
    console.log(`Ignoring unsupported top-level folder: ${relativePath}`);
    continue;
  }
  const details = await stat(filePath);
  files.push({
    filePath,
    bucket,
    key: relativePath.split(path.sep).join('/'),
    size: details.size,
  });
}

const totalBytes = files.reduce((sum, item) => sum + item.size, 0);
const uniqueBuckets = [...new Set(files.map((item) => item.bucket))];
for (const bucket of uniqueBuckets) {
  await client.send(new HeadBucketCommand({ Bucket: bucket }));
}

console.log(
  `Ready: ${files.length} files, ${(totalBytes / 1024 ** 3).toFixed(2)} GiB, ` +
    `${uniqueBuckets.length} bucket(s), concurrency ${concurrency}`,
);

let cursor = 0;
let completed = 0;
let uploaded = 0;
let skipped = 0;
let failed = 0;
let processedBytes = 0;
const failures = [];
let lastReportedPercent = -1;

function reportProgress(force = false) {
  const percent = totalBytes
    ? Math.floor((processedBytes / totalBytes) * 100)
    : 100;
  if (!force && percent === lastReportedPercent && completed % 25 !== 0) return;
  lastReportedPercent = percent;
  console.log(
    `PROGRESS ${percent}% files=${completed}/${files.length} ` +
      `uploaded=${uploaded} skipped=${skipped} failed=${failed} ` +
      `processed=${(processedBytes / 1024 ** 3).toFixed(2)}GiB/${(
        totalBytes /
        1024 ** 3
      ).toFixed(2)}GiB`,
  );
}

async function uploadFile(item) {
  try {
    try {
      const existing = await client.send(
        new HeadObjectCommand({ Bucket: item.bucket, Key: item.key }),
      );
      if (Number(existing.ContentLength) === item.size) {
        skipped += 1;
        return;
      }
    } catch (error) {
      const status = error?.$metadata?.httpStatusCode;
      if (status && status !== 404) throw error;
    }

    const upload = new Upload({
      client,
      params: {
        Bucket: item.bucket,
        Key: item.key,
        Body: createReadStream(item.filePath),
        ContentType: contentType(item.filePath),
      },
      queueSize: 2,
      partSize: 8 * 1024 * 1024,
      leavePartsOnError: false,
    });
    await upload.done();
    uploaded += 1;
  } catch (error) {
    failed += 1;
    failures.push({
      bucket: item.bucket,
      key: item.key,
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    completed += 1;
    processedBytes += item.size;
    reportProgress();
  }
}

async function worker() {
  while (true) {
    const index = cursor;
    cursor += 1;
    if (index >= files.length) return;
    await uploadFile(files[index]);
  }
}

await Promise.all(Array.from({ length: concurrency }, () => worker()));
reportProgress(true);

if (failures.length) {
  console.error('FAILURES');
  for (const item of failures.slice(0, 100)) {
    console.error(`${item.bucket}\t${item.key}\t${item.error}`);
  }
  process.exitCode = 1;
} else {
  console.log('UPLOAD_COMPLETE');
}
