const assert = require('node:assert/strict');
require('ts-node').register({ transpileOnly: true });
const { PlaybackGuard } = require('../src/modules/auth/auth.guards.ts');
const { ReleasesService } = require('../src/modules/releases/releases.service.ts');
const { PlaylistsService } = require('../src/modules/playlists/playlists.service.ts');
const { StorageController } = require('../src/modules/storage/storage.controller.ts');
const { AuthService } = require('../src/modules/auth/auth.service.ts');

async function main() {
  let user = null;
  let required = true;
  let isMix = true;
  let guestMix = true;
  const auth = { getUserFromRequest: async () => user, getAuthSettings: async () => ({ playbackRequiresRegistration: required, allowGuestMixPlayback: guestMix }) };
  const prisma = { track: { findUnique: async () => ({ release: { isMix } }) } };
  const request = { params: { id: 'test-track' }, query: { isPublic: true } };
  const context = { switchToHttp: () => ({ getRequest: () => request }) };
  const guard = new PlaybackGuard(auth, prisma);
  assert.equal(await guard.canActivate(context), true);
  isMix = false;
  await assert.rejects(guard.canActivate(context), { status: 401 });
  user = { id: 'member' };
  assert.equal(await guard.canActivate(context), true);
  user = null;
  required = false;
  assert.equal(await guard.canActivate(context), true);
  required = true;
  isMix = true;
  guestMix = false;
  await assert.rejects(guard.canActivate(context), { status: 401 });
  required = false;
  await assert.rejects(guard.canActivate(context), { status: 401 });
  required = true;
  guestMix = true;

  const config = { get: () => undefined };
  const storage = { getSignedObjectUrl: async (bucket, key) => `signed:${key}` };
  const file = { storageKey: 'audio/test.mp3', storageUrl: 'old-url', normalizedStorageKey: 'audio/normalized.mp3', normalizedStorageUrl: 'old-normalized-url' };
  const mix = { id: 'mix', isMix: true, tracks: [{ audioFiles: [file] }] };
  const trackRelease = { ...mix, id: 'record', isMix: false };
  const releases = Object.assign(Object.create(ReleasesService.prototype), { configService: config, storageService: storage });
  const publicMix = await releases.signReleaseUrls(mix, false, true);
  assert.equal(publicMix.tracks[0].audioFiles[0].storageUrl, 'signed:audio/normalized.mp3');
  const lockedTrack = await releases.signReleaseUrls(trackRelease, false);
  for (const key of ['storageUrl', 'normalizedStorageUrl', 'storageKey', 'normalizedStorageKey']) assert.equal(lockedTrack.tracks[0].audioFiles[0][key], null);
  const closedMix = await releases.signReleaseUrls(mix, true, false);
  assert.equal(closedMix.tracks[0].audioFiles[0].storageUrl, null);

  const playlists = Object.assign(Object.create(PlaylistsService.prototype), { configService: config, storageService: storage });
  const playlist = await playlists.signPlaylistAudioUrls({ items: [{ track: { release: mix, audioFiles: [file] } }, { track: { release: trackRelease, audioFiles: [file] } }] }, false, true);
  assert.equal(playlist.items[0].track.audioFiles[0].storageUrl, 'signed:audio/normalized.mp3');
  assert.equal(playlist.items[1].track.audioFiles[0].storageUrl, null);

  releases.prisma = { track: { findMany: async () => [
    { id: 'mix-track', artists: [], title: 'Mix', release: mix, audioFiles: [file] },
    { id: 'regular-track', artists: [], title: 'Track', release: trackRelease, audioFiles: [file] },
  ] } };
  const queue = await releases.findLibraryQueue({}, false, true);
  assert.equal(queue[0].audioUrl, 'signed:audio/normalized.mp3');
  assert.equal(queue[1].audioUrl, null);

  // Permission checks run before touching the local filesystem.
  const storagePrisma = { audioFile: { findFirst: async ({ where }) => {
    assert.deepEqual(where.OR, [{ storageKey: 'audio/test.mp3' }, { normalizedStorageKey: 'audio/test.mp3' }]);
    return { track: { release: { isMix } } };
  } } };
  const localStorage = { isLocalBucket: () => true, resolveLocalObjectPath: () => { throw new Error('filesystem-reached'); } };
  const controller = new StorageController(localStorage, auth, storagePrisma);
  isMix = false;
  await assert.rejects(controller.streamLocalObject('audio', { params: { key: ['audio', 'test.mp3'] } }, {}), { status: 401 });
  isMix = true;
  await assert.rejects(controller.streamLocalObject('audio', { params: { key: ['audio', 'test.mp3'] } }, {}), { status: 404 });
  guestMix = false;
  required = false;
  await assert.rejects(controller.streamLocalObject('audio', { params: { key: ['audio', 'test.mp3'] } }, {}), { status: 401 });

  const settings = new Map();
  const service = new AuthService({ appSetting: {
    findUnique: async ({ where }) => settings.has(where.key) ? { value: settings.get(where.key) } : null,
    upsert: async ({ where, create }) => { settings.set(where.key, create.value); },
  } }, config, storage);
  assert.equal((await service.getSiteSettings()).allowGuestMixPlayback, false);
  await service.updateAuthSettings({ allowGuestMixPlayback: true });
  assert.equal((await service.getSiteSettings()).allowGuestMixPlayback, true);
  assert.equal((await service.getAuthSettings()).playbackRequiresRegistration, true);
  await service.updateAuthSettings({ allowGuestMixPlayback: false, playbackRequiresRegistration: false });
  assert.equal((await service.getSiteSettings()).allowGuestMixPlayback, false);
  assert.equal((await service.getAuthSettings()).playbackRequiresRegistration, false);
  console.log('PASS: independent mix/track switches, persisted settings, mixed playlists, library queue and local MP3 authorization (mock fixtures; no production changes)');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
