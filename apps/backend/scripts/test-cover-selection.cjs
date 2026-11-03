const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
require('ts-node').register({ transpileOnly: true });
const { ReleasesService } = require('../src/modules/releases/releases.service.ts');

(async () => {
  const images = [
    { id: 'front', releaseId: 'release', type: 'COVER', isBackCover: false, storageKey: 'covers/front.png', url: '/front' },
    { id: 'gallery', releaseId: 'release', type: 'GALLERY', isBackCover: false, storageKey: 'covers/gallery.png', url: '/gallery' },
    { id: 'back', releaseId: 'release', type: 'GALLERY', isBackCover: true, storageKey: 'covers/manual/release/back.png', url: '/back' },
  ];
  const before = images.map(image => ({ id: image.id, key: image.storageKey, url: image.url }));
  const release = { id: 'release', coverStorageKey: 'covers/front.png' };
  const operations = [];
  let failImageUpdate = false;
  const service = Object.create(ReleasesService.prototype);
  service.configService = { get: () => null };
  // Prepared renditions are reused; assigning a side never copies the original.
  service.storageService = {
    objectExists: async () => true,
    getSignedObjectUrl: async (_bucket,key) => `/signed/${key}`,
    openDownload: () => { throw Error('Unexpected original download'); },
    uploadObject: () => { throw Error('Unexpected duplicate upload'); },
  };
  service.prisma = {
    image: {
      findFirst: async ({ where }) => images.find(image => image.id === where.id && image.releaseId === where.releaseId),
      updateMany: async ({ where, data }) => {
        operations.push('images');
        for (const image of images) if (Object.entries(where).every(([key,value]) => image[key] === value)) Object.assign(image, data);
      },
      update: async ({ where, data }) => {
        if (failImageUpdate) throw Error('simulated update failure');
        return Object.assign(images.find(image => image.id === where.id), data);
      },
    },
    release: { update: async ({ data }) => {
      operations.push('release-lock');
      const {images:nested,...fields}=data;
      Object.assign(release,fields);
      if(nested?.updateMany) for(const image of images) {
        if(Object.entries(nested.updateMany.where).every(([key,value])=>image[key]===value)) Object.assign(image,nested.updateMany.data);
      }
    } },
    $transaction: async operation => {
      const savedImages = structuredClone(images); const savedRelease = structuredClone(release);
      try { return await operation(service.prisma); }
      catch (error) { images.splice(0, images.length, ...savedImages); for (const key of Object.keys(release)) delete release[key];Object.assign(release,savedRelease);throw error; }
    },
  };
  service.findOne = async () => ({ ...release, images });
  await assert.rejects(() => service.selectCover('other-release', 'gallery', 'front'), /not found/);
  await assert.rejects(() => service.selectCover('release', 'gallery', 'invalid'), /Invalid cover side/);
  await service.selectCover('release', 'gallery', 'front');
  assert.equal(release.coverStorageKey, 'covers/gallery.png');
  assert(release.coverThumbStorageKey.endsWith('/thumb.webp'));
  assert(release.coverMediumStorageKey.endsWith('/medium.webp'));
  assert.notEqual(release.coverThumbStorageKey, release.coverStorageKey);
  assert.equal(images.find(image => image.id === 'front').type, 'GALLERY');
  assert.equal(images.find(image => image.id === 'gallery').type, 'COVER');
  assert.equal(operations[0], 'release-lock', 'side updates serialize on the release first');
  await service.selectCover('release', 'gallery', 'back');
  assert.equal(images.filter(image => image.isBackCover).length, 1);
  assert.equal(images.find(image => image.id === 'gallery').isBackCover, true, 'one existing photo can be assigned to both sides');
  for (let attempt = 0; attempt < 5; attempt++) {
    await service.selectCover('release', 'front', 'front');
    await service.selectCover('release', 'back', 'back');
  }
  assert.deepEqual(images.map(image => ({ id:image.id, key:image.storageKey, url:image.url })), before, 'repeated assignments create no rows and change no files');
  failImageUpdate = true;
  await assert.rejects(() => service.selectCover('release', 'gallery', 'back'), /simulated/);
  assert.equal(images.find(image => image.id === 'back').isBackCover, true, 'failed reassignment retains the previous back');
  failImageUpdate = false;
  await service.removeBackCover('release');
  assert.equal(images.some(image => image.isBackCover), false);
  assert.equal(images.length, before.length, 'removing a side only detaches its photo');
  await service.selectCover('release','front','back');
  await service.removeCover('release');
  assert.equal(release.coverStorageKey,null);
  assert.equal(images.some(image=>image.type==='COVER'),false);
  assert.equal(images.find(image=>image.id==='front').isBackCover,true,'front hiding cannot detach the same photo from back');
  assert.deepEqual(images.map(image=>({id:image.id,key:image.storageKey,url:image.url})),before,'hiding front preserves every gallery row and file reference');
  await service.selectCover('release','front','front');
  assert.equal(release.coverStorageKey,'covers/front.png','hidden front can be restored without a new file');
  await service.removeBackCover('release');
  assert.equal(release.coverStorageKey,'covers/front.png','hiding back cannot detach front');
  await service.selectCover('release','back','back');
  await service.selectCover('release','gallery','front2');
  await service.selectCover('release','back','back2');
  assert.equal(release.coverStorageKey,'covers/front.png','C/D assignment cannot replace the main cover');
  assert.equal(images.find(image=>image.id==='back').isBackCover,true,'first vinyl keeps its back');
  assert.equal(images.find(image=>image.id==='gallery').isSecondFrontCover,true);
  assert.equal(images.find(image=>image.id==='back').isSecondBackCover,true);
  await service.selectCover('release','front','front2');
  assert.equal(images.filter(image=>image.isSecondFrontCover).length,1);
  failImageUpdate=true;
  await assert.rejects(()=>service.selectCover('release','gallery','front2'),/simulated/);
  assert.equal(images.find(image=>image.id==='front').isSecondFrontCover,true,'C reassignment is atomic');
  failImageUpdate=false;
  await service.removeBackCover('release','front2');
  assert.equal(images.some(image=>image.isSecondFrontCover),false);
  assert.equal(images.find(image=>image.id==='back').isSecondBackCover,true,'hiding C preserves D');
  service.prisma.release.count=async()=>0;
  await assert.rejects(()=>service.deleteGalleryImage('release','back'),/обложку/,'assigned D cannot be deleted');
  await service.removeBackCover('release','back2');
  assert.equal(images.find(image=>image.id==='back').isBackCover,true,'hiding D preserves B even when both use one photo');
  assert.deepEqual(images.map(image=>({id:image.id,key:image.storageKey,url:image.url})),before,'C/D assignment creates or deletes no photos');
  await assert.rejects(()=>service.removeBackCover('release','invalid'),/Invalid cover side/);
  await assert.rejects(()=>service.uploadBackCover('release',null,'invalid'),/Invalid cover side/);
  const controller = fs.readFileSync(path.join(__dirname, '../src/modules/releases/releases.controller.ts'), 'utf8');
  assert.match(controller, /@Post\(':id\/cover-selection'\)\s+@UseGuards\(AdminGuard\)/);
  console.log('PASS: existing-photo front/back assignment, repeated selection without files or rows, both-side reuse, ownership, atomic rollback, detach and admin guard');
})().catch(error => { console.error(error); process.exitCode = 1; });
