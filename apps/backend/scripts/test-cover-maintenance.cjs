const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
require('ts-node').register({ transpileOnly: true });
const sharp = require('sharp');
const { CoverMaintenanceService } = require('../src/modules/releases/cover-maintenance.service.ts');
const { ReleasesController } = require('../src/modules/releases/releases.controller.ts');
const { AdminGuard } = require('../src/modules/auth/auth.guards.ts');
const { GUARDS_METADATA } = require('@nestjs/common/constants');

async function finish(service) {
  for (let count = 0; count < 500; count++) {
    if (service.status().status !== 'running') return service.status();
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  throw Error('Job did not finish');
}

function fixture(files, options = {}) {
  const release = { id: 'release', updatedAt: new Date('2026-01-01'),
    coverStorageKey: 'covers/source.jpg', coverStorageUrl: '/old', coverImageUrl: '/external',
    coverThumbStorageKey: 'covers/thumb.webp', coverThumbStorageUrl: '/thumb', coverMediumStorageKey: null,
    images: [{ id: 'photo', releaseId: 'release', storageKey: 'covers/source.jpg', url: '/old', thumbStorageKey: 'covers/thumb.webp',
      mediumStorageKey: null, type: 'GALLERY', isBackCover: true, isSecondFrontCover: false, isSecondBackCover: true }],
  };
  const snapshot = () => structuredClone(release);
  const uploads = [];
  const reads = [];
  let writes = 0;
  const database = {
    release: {
      findMany: async () => [snapshot()],
      updateMany: async ({ where, data }) => {
        if (Object.entries(where).some(([key, value]) => value instanceof Date ? +release[key] !== +value : release[key] !== value)) return { count: 0 };
        writes++; Object.assign(release, data); return { count: 1 };
      },
    },
    image: { updateMany: async ({ where, data }) => {
      if (options.failTransaction) throw Error('DB failure');
      const rows = release.images.filter(row => Object.entries(where).every(([key, value]) => row[key] === value));
      rows.forEach(row => Object.assign(row, data));
      writes++; return { count: rows.length };
    } },
    $transaction: async fn => {
      const before = snapshot();
      try { return await fn(database); }
      catch (error) { Object.assign(release, before); throw error; }
    },
  };
  const storage = {
    objectExists: async (_bucket, key) => files.has(key),
    openDownload: async (_bucket, key) => {
      reads.push(key);
      if (options.onRead) options.onRead(release, key);
      if (!files.has(key)) throw Error('Missing object');
      return Readable.from([files.get(key)]);
    },
    uploadObject: async ({ key, body, contentType }) => {
      if (options.failUpload) throw Error('Upload failure');
      uploads.push({ key, contentType }); files.set(key, body); return `/${key}`;
    },
    getSignedObjectUrl: async (_bucket, key) => `/${key}`,
  };
  const service = new CoverMaintenanceService(database, storage, { get: () => 'covers' });
  return { service, release, files, uploads, reads, writes: () => writes };
}

(async () => {
  const png = await sharp({ create: { width: 800, height: 600, channels: 3, background: '#428a32' } }).png({ compressionLevel: 0 }).toBuffer();
  const webp = await sharp(png).resize(320).webp().toBuffer();
  const originals = () => new Map([['covers/source.jpg', png], ['covers/thumb.webp', webp]]);
  let f = fixture(originals());
  const before = structuredClone(f.release);
  const first = f.service.start('check');
  assert.equal(f.service.start('convert').id, first.id, 'Deduplicate a concurrent request');
  let status = await finish(f.service);
  assert.equal(status.mode, 'check');
  assert.equal(status.total, 2, 'Deduplicate file references');
  assert.equal(status.formats.png, 1, 'Inspect actual file format, not the extension');
  assert.equal(status.webp, 1);
  assert.equal(f.uploads.length, 0);
  assert.equal(f.writes(), 0);
  assert.deepEqual(f.release, before, 'Audit must be read-only');
  const detached = f.service.status(); detached.formats.png = 999; detached.errors.push({ key: 'fake' });
  assert.equal(f.service.status().formats.png, 1);
  assert.equal(f.service.status().errors.length, 0);

  f.service.start('convert');
  status = await finish(f.service);
  assert.equal(status.converted, 1);
  assert.equal(status.failed, 0);
  assert.ok(status.bytesAfter < status.bytesBefore);
  assert.equal(f.files.get('covers/source.jpg'), png, 'Keep original bytes');
  assert.equal(f.release.images.length, 1, 'No new gallery rows');
  const image = f.release.images[0];
  assert.equal(image.isBackCover, true);
  assert.equal(image.isSecondBackCover, true);
  assert.equal(image.isSecondFrontCover, false);
  assert.equal(image.type, 'GALLERY');
  assert.equal(image.storageKey, f.release.coverStorageKey, 'All references use the same converted object');
  assert.equal(image.thumbStorageKey, 'covers/thumb.webp');
  const converted = await sharp(f.files.get(image.storageKey)).metadata();
  assert.equal(converted.format, 'webp');
  assert.equal(converted.width, 800); assert.equal(converted.height, 600);
  const manifestKey = f.uploads.find(item => item.contentType === 'application/json').key;
  assert.equal(JSON.parse(f.files.get(manifestKey)).sourceKey, 'covers/source.jpg');
  const uploadCount = f.uploads.length;
  f.service.start('convert'); status = await finish(f.service);
  assert.equal(status.converted, 0); assert.equal(status.webp, 2);
  assert.equal(f.uploads.length, uploadCount, 'Repeated jobs must not re-encode WebP');

  f = fixture(originals(), { failUpload: true });
  f.service.start('convert'); status = await finish(f.service);
  assert.equal(status.failed, 1); assert.equal(status.converted, 0);
  assert.equal(status.bytesAfter, status.bytesBefore, 'Failures must not claim byte savings');
  assert.equal(f.release.coverStorageKey, 'covers/source.jpg'); assert.equal(f.writes(), 0);

  f = fixture(originals(), { failTransaction: true });
  f.service.start('convert'); status = await finish(f.service);
  assert.equal(status.failed, 1); assert.equal(status.bytesAfter, status.bytesBefore);
  assert.equal(f.release.coverStorageKey, 'covers/source.jpg');
  assert.equal(f.release.images[0].storageKey, 'covers/source.jpg', 'Roll back all DB refs together');

  f = fixture(originals(), { onRead: (release, key) => {
    if (key === 'covers/source.jpg') {
      release.updatedAt = new Date('2027-01-01');
      release.coverStorageKey = 'covers/new-choice.webp';
    }
  } });
  f.service.start('convert'); status = await finish(f.service);
  assert.equal(status.stale, 1);
  assert.equal(f.release.coverStorageKey, 'covers/new-choice.webp');
  assert.equal(f.release.images[0].storageKey, 'covers/source.jpg', 'Concurrent changes must protect gallery refs too');

  f = fixture(originals());
  f.files.set('covers/source.jpg', Buffer.from('broken'));
  f.service.start('check'); status = await finish(f.service);
  assert.equal(status.failed, 1); assert.equal(status.processed, 2, 'Continue after a broken image');
  assert.equal(f.uploads.length, 0);
  f = fixture(originals());
  f.files.delete('covers/source.jpg');
  f.service.start('convert'); status = await finish(f.service);
  assert.equal(status.failed, 1); assert.equal(f.release.coverStorageKey, 'covers/source.jpg');

  f = fixture(originals());
  f.release.coverStorageKey = null; f.release.images = [];
  f.service.start('check'); status = await finish(f.service);
  assert.equal(status.withoutStorageKey, 1, 'Do not fetch arbitrary external URLs');
  f = fixture(originals());
  f.release.coverStorageKey = '../private/key'; f.release.images = [];
  f.service.start('convert'); status = await finish(f.service);
  assert.equal(status.failed, 1); assert.ok(!f.reads.includes('../private/key'));

  const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
  f = fixture(originals()); f.files.set('covers/source.jpg', gif);
  f.service.start('convert'); status = await finish(f.service);
  assert.equal(status.skipped, 1); assert.equal(f.uploads.length, 0);

  const noise = Buffer.alloc(64 * 64 * 3);
  for (let index = 0; index < noise.length; index++) noise[index] = (index * 79 + index % 13 * 137) % 256;
  const smallJpeg = await sharp(noise, { raw: { width: 64, height: 64, channels: 3 } }).jpeg({ quality: 1 }).toBuffer();
  assert.ok((await sharp(smallJpeg).webp({ quality: 90, effort: 5 }).toBuffer()).length > smallJpeg.length);
  f = fixture(originals()); f.files.set('covers/source.jpg', smallJpeg);
  f.service.start('convert'); status = await finish(f.service);
  assert.equal(status.skipped, 1); assert.equal(status.bytesAfter, status.bytesBefore);
  assert.equal(f.release.coverStorageKey, 'covers/source.jpg', 'Never increase the file size');

  f = fixture(originals());
  f.files.set('covers/back.png', png);
  f.release.images.push({ ...f.release.images[0], id: 'back', storageKey: 'covers/back.png', thumbStorageKey: null });
  f.service.start('convert'); status = await finish(f.service);
  assert.equal(status.converted, 2); assert.equal(status.stale, 0, 'Own changes must not invalidate the next side of the release');
  assert.match(f.release.images[1].storageKey, /image\.webp$/);

  for (const method of ['coverMaintenanceStatus', 'checkCoverFormats', 'convertCoverFormats']) {
    assert.ok(Reflect.getMetadata(GUARDS_METADATA, ReleasesController.prototype[method]).includes(AdminGuard));
  }
  for (const user of [null, { id: 'member', role: 'USER' }]) {
    const guard = new AdminGuard({ getUserFromRequest: async () => user });
    await assert.rejects(() => guard.canActivate({ switchToHttp: () => ({ getRequest: () => ({}) }) }));
  }
  assert.equal(await new AdminGuard({ getUserFromRequest: async () => ({ role: 'ADMIN' }) }).canActivate({ switchToHttp: () => ({ getRequest: () => ({}) }) }), true);
  console.log('PASS: read-only actual-format audit, deduplication, originals/dimensions/sides preserved, atomic guarded updates, upload/DB/broken/missing failures, retry, idempotency and admin-only routes');
})().catch(error => { console.error(error); process.exitCode = 1; });
