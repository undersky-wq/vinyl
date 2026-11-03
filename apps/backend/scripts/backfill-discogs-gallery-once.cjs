// One-shot, additive only. Never changes Release fields or removes/overwrites an existing object.
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const appRequire = createRequire(path.join(process.cwd(), 'package.json'));
const { PrismaClient } = appRequire('@prisma/client');
const { ConfigService } = appRequire('@nestjs/config');
const { request } = appRequire('undici');
const sharp = appRequire('sharp');
const { StorageService } = appRequire('./dist/modules/storage/storage.service.js');
const apply = process.argv.includes('--apply');
const reportPath = process.env.GALLERY_REPORT || '/tmp/discogs-gallery-completion.json';
const prisma = new PrismaClient();
const config = new ConfigService(process.env);
const storage = new StorageService(config);
const bucket = process.env.SELECTEL_S3_BUCKET_COVERS || 'covers';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const report = { apply, startedAt: new Date().toISOString(), baseline: [], releases: [], added: 0, restoredFiles: 0, skipped: 0, failed: 0 };
const save = () => fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
let nextApiAt = 0;
async function discogs(id) {
  for (let attempt = 0; attempt < 4; attempt++) {
    await sleep(Math.max(0, nextApiAt - Date.now()));
    nextApiAt = Date.now() + 1200;
    const response = await request(`https://api.discogs.com/releases/${id}`, {
      headers: { 'User-Agent': 'MityaDimaGalleryAudit/1.0', ...(process.env.DISCOGS_USER_TOKEN ? { Authorization: `Discogs token=${process.env.DISCOGS_USER_TOKEN}` } : {}) },
      headersTimeout: 25000, bodyTimeout: 25000,
    });
    const text = await response.body.text();
    if (response.statusCode === 429 && attempt < 3) { await sleep(Math.min(60000, Math.max(15000, Number(response.headers['retry-after']) * 1000 || 0))); continue; }
    if (response.statusCode !== 200) throw new Error(`Discogs HTTP ${response.statusCode}`);
    const data = JSON.parse(text);
    if (data.id !== id || !Array.isArray(data.images)) throw new Error('Discogs returned no image manifest');
    return data.images;
  }
  throw new Error('Discogs rate limit');
}
async function exists(key) {
  try { const stream = await storage.openDownload(bucket, key); stream.on('error', () => {}); stream.destroy(); return true; }
  catch (error) {
    if (error.code === 'ENOENT' || error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) return false;
    throw error;
  }
}
async function imageBytes(url) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || !['i.discogs.com', 'img.discogs.com'].includes(parsed.hostname)) throw new Error('Unexpected Discogs image host');
  const response = await request(url, { headers: { 'User-Agent': 'MityaDimaGalleryAudit/1.0' }, headersTimeout: 25000, bodyTimeout: 30000 });
  if (response.statusCode !== 200) { await response.body.dump(); throw new Error(`Image HTTP ${response.statusCode}`); }
  const chunks = []; let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > 20 * 1024 * 1024) { response.body.destroy(); throw new Error('Image exceeds 20 MB'); }
    chunks.push(chunk);
  }
  const body = Buffer.concat(chunks);
  const metadata = await sharp(body).metadata();
  if (!metadata.width || !metadata.height || !['jpeg', 'png', 'webp'].includes(metadata.format)) throw new Error('Invalid image body');
  return { body, contentType: metadata.format === 'jpeg' ? 'image/jpeg' : `image/${metadata.format}` };
}
(async () => {
  const releases = await prisma.release.findMany({ where: { discogsReleaseId: { gt: 0 }, isMix: false, isOriginal: false }, orderBy: { createdAt: 'asc' }, select: {
    id: true, discogsReleaseId: true, artist: true, title: true,
    coverStorageKey: true, coverStorageUrl: true, coverImageUrl: true,
    coverThumbStorageKey: true, coverThumbStorageUrl: true, coverMediumStorageKey: true, coverMediumStorageUrl: true,
    images: true,
  } });
  report.baseline = releases; save();
  console.log(JSON.stringify({ event: 'start', apply, releases: releases.length }));
  for (const release of releases) {
    const row = { id: release.id, discogsReleaseId: release.discogsReleaseId, added: [], restored: [], errors: [] };
    try {
      const images = await discogs(release.discogsReleaseId);
      let secondary = 0;
      for (const image of images) {
        const key = image.type === 'primary' ? `covers/${release.discogsReleaseId}/front.jpg` : `covers/${release.discogsReleaseId}/gallery-${++secondary}.jpg`;
        try {
          const known = await prisma.image.findUnique({ where: { storageKey: key } });
          if (known && known.releaseId !== release.id) throw new Error('Object belongs to another release');
          const available = await exists(key);
          if (known && available) { report.skipped++; continue; }
          let url = known?.url || '';
          if (available) url = await storage.getSignedObjectUrl(bucket, key) || url;
          else {
            const source = image.uri || image.uri150;
            if (!source) throw new Error('Discogs image has no URL');
            if (apply) {
              const file = await imageBytes(source);
              // Recheck immediately before writing; do not overwrite concurrent uploads.
              if (await exists(key)) throw new Error('Object appeared concurrently; skipped');
              url = await storage.uploadObject({ bucket, key, ...file }) || '';
            }
          }
          if (!known) {
            if (apply) {
              const created = await prisma.image.create({ data: { releaseId: release.id, type: 'GALLERY', storageKey: key, url } });
              row.added.push({ id: created.id, key, uploaded: !available });
            } else row.added.push({ key, uploaded: !available });
            report.added++;
          } else { row.restored.push(key); report.restoredFiles++; }
        } catch (error) { row.errors.push({ key, error: error.message }); report.failed++; }
      }
    } catch (error) { row.errors.push({ error: error.message }); report.failed++; }
    report.releases.push(row); save();
    console.log(JSON.stringify({ event: 'release', done: report.releases.length, total: releases.length, discogs: release.discogsReleaseId, added: row.added.length, restored: row.restored.length, errors: row.errors.length }));
  }
  report.finishedAt = new Date().toISOString(); save();
  console.log(JSON.stringify({ event: 'complete', releases: report.releases.length, added: report.added, restored: report.restoredFiles, skipped: report.skipped, failed: report.failed }));
})().catch(error => { report.fatal = error.message; save(); console.error(error.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
