const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { Readable } = require('node:stream');
const sharp = require('sharp');
const script = fs.readFileSync(path.join(__dirname, 'backfill-discogs-gallery-once.cjs'), 'utf8');
(async () => {
  const photo = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#123' } }).png().toBuffer();
  const files = new Map([['covers/1/front.jpg', photo], ['covers/1/gallery-1.jpg', photo]]);
  const rows = ['front.jpg', 'gallery-1.jpg', 'gallery-3.jpg'].map((name, index) => ({ id: String(index), releaseId: 'release', type: index ? 'GALLERY' : 'COVER', storageKey: `covers/1/${name}`, url: '/existing' }));
  const release = { id: 'release', discogsReleaseId: 1, artist: 'Test', title: 'Test release', coverStorageKey: 'covers/manual/release/custom.webp' };
  const uploads = []; const creates = [];
  async function run(apply) {
    let report; let finish;
    const done = new Promise(resolve => { finish = resolve; });
    const prisma = {
      release: { findMany: async () => [{ ...release, images: rows.map(row => ({ ...row })) }] },
      image: {
        findUnique: async ({ where }) => rows.find(row => row.storageKey === where.storageKey),
        create: async ({ data }) => { creates.push(data); const row = { id: `new-${rows.length}`, ...data }; rows.push(row); return row; },
      },
      $disconnect: async () => finish(),
    };
    const modules = {
      '@prisma/client': { PrismaClient: function () { return prisma; } },
      '@nestjs/config': { ConfigService: class {} },
      sharp,
      './dist/modules/storage/storage.service.js': { StorageService: class {
        async openDownload(_bucket, key) { if (!files.has(key)) throw Object.assign(Error('missing'), { name: 'NoSuchKey' }); return Readable.from([files.get(key)]); }
        async uploadObject({ key, body }) { assert(!files.has(key), 'existing objects must never be overwritten'); uploads.push(key); files.set(key, body); return `/new/${key}`; }
        async getSignedObjectUrl(_bucket, key) { return `/existing/${key}`; }
      } },
      undici: { request: async url => url.includes('api.discogs.com') ? { statusCode: 200, body: { text: async () => JSON.stringify({ id: 1, images: ['primary','secondary','secondary','secondary'].map((type, index) => ({ type, uri: `https://i.discogs.com/image-${index}.png` })) }) } }
        : { statusCode: 200, body: Readable.from([photo]) } },
    };
    const processMock = { env: {}, argv: apply ? ['node','script','--apply'] : ['node','script'], cwd: () => '/app', exitCode: 0 };
    vm.runInNewContext(script, { Buffer, URL, Date, setTimeout: callback => { queueMicrotask(callback); }, console: { log() {}, error() {} }, process: processMock,
      require: name => name === 'node:module' ? { createRequire: () => module => modules[module] } : name === 'node:fs' ? { writeFileSync: (_file, value) => { report = JSON.parse(value); } } : require(name),
    });
    await done;
    assert.equal(processMock.exitCode, 0);
    assert(!report.fatal);
    assert.equal(report.failed, 0);
    return report;
  }
  const dry = await run(false);
  assert.equal(dry.added, 1); assert.equal(dry.restoredFiles, 1);
  assert.equal(uploads.length, 0); assert.equal(creates.length, 0);
  const applied = await run(true);
  assert.equal(applied.added, 1); assert.equal(applied.restoredFiles, 1);
  assert.deepEqual(uploads, ['covers/1/gallery-2.jpg','covers/1/gallery-3.jpg']);
  assert.equal(release.coverStorageKey, 'covers/manual/release/custom.webp');
  const again = await run(true);
  assert.equal(again.added, 0); assert.equal(again.restoredFiles, 0);
  assert.equal(uploads.length, 2, 'second run must not upload again');
  console.log('PASS: additive gallery backfill, dry run, missing-file repair, idempotence and untouched custom cover');
})().catch(error => { console.error(error); process.exitCode = 1; });
