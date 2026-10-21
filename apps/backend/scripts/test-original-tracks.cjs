const assert = require('node:assert/strict');
require('ts-node').register({ transpileOnly: true });
const { ReleasesService } = require('../src/modules/releases/releases.service.ts');
const { ReleasesController } = require('../src/modules/releases/releases.controller.ts');
const { PlaybackGuard } = require('../src/modules/auth/auth.guards.ts');

async function main() {
  const rows = [
    { id: 'vinyl', isMix: false, isOriginal: false, tracks: [] },
    { id: 'mix', isMix: true, isOriginal: false, tracks: [] },
    { id: 'own-track', isMix: true, isOriginal: true, tracks: [] },
  ];
  const service = Object.assign(Object.create(ReleasesService.prototype), {
    prisma: { release: { findMany: async ({ where }) => rows.filter(row => Object.entries(where).every(([key, value]) => key === 'collectionItems' || row[key] === value)) } },
    configService: { get: () => undefined },
    storageService: { getSignedObjectUrl: async (_, key) => `signed:${key}` },
  });
  assert.deepEqual((await service.findAll({})).map(row => row.id), ['vinyl']);
  assert.deepEqual((await service.findAll({ isMix: 'true' })).map(row => row.id), ['mix']);
  assert.deepEqual((await service.findAll({ isOriginal: 'true' })).map(row => row.id), ['own-track']);
  assert.equal((await service.findAll({ allTypes: 'true' })).length, 3);
  const own = { ...rows[2], tracks: [{ audioFiles: [{ storageKey: 'own.mp3', storageUrl: 'old' }] }] };
  assert.equal((await service.signReleaseUrls(own, false, true)).tracks[0].audioFiles[0].storageUrl, 'signed:own.mp3');
  assert.equal((await service.signReleaseUrls(own, false, false)).tracks[0].audioFiles[0].storageUrl, 'signed:own.mp3', 'originals remain public even when collection and mixes are locked');
  let storedOriginal = true;
  const guard = new PlaybackGuard({ getUserFromRequest: async () => null, getAuthSettings: async () => ({ playbackRequiresRegistration: true, allowGuestMixPlayback: false }) }, { track: { findUnique: async () => ({ release: { isMix: true, isOriginal: storedOriginal } }) } });
  const context = { switchToHttp: () => ({ getRequest: () => ({ params: { id: 'own' }, query: { isOriginal: true } }) }) };
  assert.equal(await guard.canActivate(context), true);
  storedOriginal = false;
  await assert.rejects(guard.canActivate(context), { status: 401 }, 'client-supplied flags cannot unlock a private mix');
  const input = { artist: 'Artist', title: 'Own composition', isOriginal: 'true', tracks: JSON.stringify([{ title: 'Composition' }]) };
  await assert.rejects(service.createManualRelease({ id: 'admin' }, input, []), { status: 400 });
  let created;
  service.prisma.user = { upsert: async () => ({}) };
  service.prisma.release.create = async ({ data }) => { created = data; return { id: 'new', tracks: [{ id: 'audio-track' }] }; };
  service.getNextManualDiscogsId = async () => -1;
  service.findOne = async () => created;
  service.audioService = { uploadAudio: async () => ({}) };
  await service.createManualRelease({ id: 'admin' }, input, [{ fieldname: 'audio-0' }]);
  assert.equal(created.isOriginal, true);
  assert.equal(created.isMix, true, 'own music reuses the mix waveform/comment/playback pipeline');
  const guards = Reflect.getMetadata('__guards__', ReleasesController.prototype.createManual);
  assert(guards?.some(guard => guard.name === 'AdminGuard'), 'creating public original music remains admin-only');
  console.log('PASS: separate categories, public originals, private mix protection, upload validation, admin guard');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
