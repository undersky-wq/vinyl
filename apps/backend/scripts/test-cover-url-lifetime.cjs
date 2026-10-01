const assert = require('node:assert/strict');
require('ts-node').register({ transpileOnly: true });
const { StorageService } = require('../src/modules/storage/storage.service.ts');
// Isolate the injected auth dependency: its transitive image-processing native
// modules are irrelevant to public-cover redirects and unavailable on this host.
const Module = require('node:module');
const originalLoad = Module._load;
Module._load = function(name, ...args) {
  if (name === '../auth/auth.service') return { AuthService: class AuthService {} };
  return originalLoad.call(this, name, ...args);
};
const { StorageController } = require('../src/modules/storage/storage.controller.ts');
Module._load = originalLoad;

async function main() {
  const values = {
    STORAGE_DRIVER: 's3-readonly',
    SELECTEL_S3_ENDPOINT: 'https://s3.ru-7.storage.selcloud.ru',
    SELECTEL_S3_ACCESS_KEY: 'test', SELECTEL_S3_SECRET_KEY: 'test',
    SELECTEL_S3_REGION: 'ru-7', SELECTEL_S3_BUCKET_COVERS: 'vinyl-covers',
    BACKEND_PUBLIC_URL: 'https://mityadima.ru',
  };
  const service = new StorageService({ get: key => values[key] });
  const key = 'covers/manual/test/обложка.webp';
  const stable = await service.getSignedObjectUrl('vinyl-covers', key);
  assert.equal(stable, 'https://mityadima.ru/api/media/vinyl-covers/covers/manual/test/%D0%BE%D0%B1%D0%BB%D0%BE%D0%B6%D0%BA%D0%B0.webp');
  const controller = new StorageController(service, {});
  const request = { params: { 0: encodeURIComponent(key) }, headers: {} };
  const response = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, redirect(status, url) { this.status = status; this.url = url; } };
  await controller.streamLocalObject('vinyl-covers', request, response);
  assert.equal(response.status, 302);
  assert.equal(response.headers['Cache-Control'], 'no-store, max-age=0');
  assert.ok(new URL(response.url).searchParams.has('X-Amz-Signature'));
  // An old signature cached by the signer is regenerated, while the address
  // held by an already-open page stays unchanged. No network/S3 writes needed.
  const cacheKey = `vinyl-covers:${key}:3600`;
  service.signedUrlCache.set(cacheKey, { url: 'expired-signature', expiresAt: Date.now() - 1 });
  await controller.streamLocalObject('vinyl-covers', request, response);
  assert.notEqual(response.url, 'expired-signature');
  assert.equal(await service.getSignedObjectUrl('vinyl-covers', key), stable);
  assert.ok((await service.getSignedObjectUrl('audio', 'audio/user/track.mp3')).includes('X-Amz-Signature'));
  for (const [bucket, rejectedKey] of [['audio', 'audio/user/track.mp3'], ['vinyl-covers', 'avatars/user.webp'], ['vinyl-covers', 'covers/../secret']]) {
    await assert.rejects(controller.streamLocalObject(bucket, { params: { 0: rejectedKey }, headers: {} }, response));
  }
  console.log('PASS: stable artwork, expired signature renewal, uncached redirects, unchanged audio and private-object restrictions');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
