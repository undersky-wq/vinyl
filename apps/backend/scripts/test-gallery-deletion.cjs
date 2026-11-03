const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
require('ts-node').register({ transpileOnly: true });
const { ReleasesService } = require('../src/modules/releases/releases.service.ts');
(async () => {
  const service = Object.create(ReleasesService.prototype);
  const image = { id: 'photo', releaseId: 'release', storageKey: 'covers/1/gallery-1.jpg' };
  let referenced = 0; let failStorage = false; const deleted = [];
  service.configService = { get: () => 'covers' };
  service.prisma = {
    image: {
      findFirst: async ({ where }) => where.releaseId === 'release' && where.id === 'photo' ? image : null,
      delete: async ({ where }) => deleted.push(['row', where.id]),
    },
    release: { count: async () => referenced },
  };
  service.storageService = { deleteObject: async (bucket, key) => { if (failStorage) throw Error('storage unavailable'); deleted.push(['file', bucket, key]); } };
  service.findOne = async id => ({ id });
  await assert.rejects(() => service.deleteGalleryImage('other', 'photo'), /not found/);
  referenced = 1;
  await assert.rejects(() => service.deleteGalleryImage('release', 'photo'), /обложку/);
  referenced = 0; image.isBackCover = true;
  await assert.rejects(() => service.deleteGalleryImage('release', 'photo'), /обложку/);
  assert.equal(deleted.length, 0);
  image.isBackCover = false; failStorage = true;
  await assert.rejects(() => service.deleteGalleryImage('release', 'photo'), /storage unavailable/);
  assert.equal(deleted.length, 0, 'do not report deletion when storage fails');
  failStorage = false;
  assert.equal((await service.deleteGalleryImage('release', 'photo')).id, 'release');
  assert.deepEqual(deleted, [['file','covers','covers/1/gallery-1.jpg'],['row','photo']]);
  const controller = fs.readFileSync(path.join(__dirname, '../src/modules/releases/releases.controller.ts'),'utf8');
  assert.match(controller, /@Delete\(':id\/images\/:imageId'\)\s+@UseGuards\(AdminGuard\)/);
  console.log('PASS: gallery hard-delete, admin route, release ownership, protected active covers and surfaced storage errors');
})().catch(error => { console.error(error); process.exitCode = 1; });
