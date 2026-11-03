const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const vm = require('node:vm');
const result = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/lib/release-images.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { exports: result });
const release = { id: 'hydrafunk', images: [
  { id: 'front', type: 'COVER', storageKey: 'covers/8519316/front.jpg', url: 'https://example.test/front.jpg' },
  { id: 'discogs', type: 'GALLERY', storageKey: 'covers/8519316/gallery-1.jpg', url: 'https://example.test/gallery.jpg' },
] };
assert.equal(result.getReleaseGalleryImages(release).length, 1);
assert.equal(result.getReleaseGalleryImages(release)[0].id, 'discogs');
assert.equal(result.getBackCoverUrl(release), '', 'gallery photos must not silently become the back cover');
release.images.push({ id: 'back', type: 'GALLERY', storageKey: 'covers/manual/hydrafunk/back.jpg', url: 'https://example.test/back.jpg' });
assert.equal(result.getReleaseGalleryImages(release).length, 1, 'manual back cover is already shown separately');
assert.equal(result.getSelectableReleaseImages(release).length, 3, 'front, back and gallery can all be chosen for either side');
assert.equal(result.getBackCoverUrl(release), 'https://example.test/back.jpg');
assert.equal(result.getReleaseGalleryImages({ id: 'empty' }).length, 0);
release.images.forEach(image => { image.isBackCover = false; });
release.images[1].isBackCover = true;
assert.equal(result.getBackCoverUrl(release), 'https://example.test/gallery.jpg', 'a Discogs photo can be assigned directly as the back');
assert.equal(result.isBackCoverImage(release, release.images[2]), false, 'an old back filename must not override explicit assignment');
release.images[1].isBackCover = false;
assert.equal(result.getBackCoverUrl(release), '', 'detaching the back must not restore a legacy filename');
release.images[0].isBackCover = true;
assert.equal(result.getBackCoverUrl(release), 'https://example.test/front.jpg', 'the same photo may be used on both sides');
const form = fs.readFileSync(path.join(__dirname, '../src/components/shelf-release-form.tsx'), 'utf8');
assert(form.includes('gallery.map((image, index)'));
assert(form.includes('rel="noopener noreferrer"'));
assert(form.includes("selectReleaseCover(data.id, image.id, 'front')"));
assert(form.includes("selectReleaseCover(data.id, image.id, 'back')"));
console.log('PASS: Discogs gallery appears separately in editor without replacing front or manual back cover');
