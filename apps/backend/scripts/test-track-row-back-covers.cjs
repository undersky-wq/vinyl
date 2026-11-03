const assert = require('node:assert/strict');
require('ts-node').register({ transpileOnly: true });
const { AppController } = require('../src/modules/app.controller.ts');
const { PlaylistsService } = require('../src/modules/playlists/playlists.service.ts');
const { signedBackCoverUrl } = require('../src/modules/releases/release-back-cover.ts');

(async () => {
  const images = [
    { id: 'old', storageKey: 'old-back.jpg', url: '/old', isBackCover: false },
    { id: 'current', storageKey: 'chosen.jpg', url: '/fallback', isBackCover: true },
  ];
  const signed = [];
  const storage = { getSignedObjectUrl: async (bucket, key) => { signed.push([bucket, key]); return `/signed/${key}`; } };
  const config = { get: key => key.includes('COVERS') ? 'covers-bucket' : 'audio-bucket' };
  const release = { id: 'record', artist: 'Artist', title: 'Record', images };
  const tracks = ['A1', 'B1', 'B2'].map((position, index) => ({ id: `track-${index}`, position, release, audioFiles: [] }));
  const queries = [];
  const playlist = { id: 'playlist', items: tracks.map((track, sortOrder) => ({ track, sortOrder })) };
  const prisma = {
    favoriteTrack: { findMany: async query => { queries.push(query); return tracks.map(track => ({ track })); } },
    playlist: {
      findMany: async query => { queries.push(query); return [playlist]; },
      findUnique: async query => { queries.push(query); return playlist; },
    },
  };
  const favorites = await new AppController(config, prisma, storage).favoriteTracks({ user: { id: 'owner' } });
  assert.equal(queries[0].where.userId, 'owner');
  assert.deepEqual(favorites.map(track => track.position), ['A1', 'B1', 'B2']);
  assert(favorites.every(track => track.release.backCoverUrl === '/signed/chosen.jpg'));
  const service = new PlaylistsService(prisma, config, storage);
  const all = await service.findAll('owner');
  const one = await service.findOne('playlist', false, false);
  for (const data of [all[0], one]) {
    assert.deepEqual(data.items.map(item => item.track.position), ['A1', 'B1', 'B2']);
    assert(data.items.every(item => item.track.release.backCoverUrl === '/signed/chosen.jpg'));
  }
  for (const query of queries.slice(1)) {
    assert.deepEqual(query.include.items.include.track.include.release.include.images.where.OR, [{isBackCover:true},{isSecondFrontCover:true},{isSecondBackCover:true}], 'load only assigned vinyl covers, not the whole gallery');
  }
  assert(signed.every(([bucket, key]) => bucket === 'covers-bucket' && key === 'chosen.jpg'));
  assert.equal(await signedBackCoverUrl(images, async () => null), '/fallback');
  assert.equal(await signedBackCoverUrl([images[0]], async () => { throw Error('must not sign hidden images'); }), null);
  assert.equal(await signedBackCoverUrl(undefined, async () => { throw Error('no images'); }), null);
  assert.equal(images.length, 2, 'reading back covers never mutates the gallery');
  console.log('PASS: favorites and both playlist endpoints provide signed assigned back covers, preserve track positions and order, hidden/missing photos fall back safely');
})().catch(error => { console.error(error); process.exitCode = 1; });
