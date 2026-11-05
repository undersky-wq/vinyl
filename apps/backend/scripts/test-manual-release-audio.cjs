const assert = require('node:assert/strict');
require('reflect-metadata');
require('ts-node').register({ transpileOnly: true });
const { ReleasesService } = require('../src/modules/releases/releases.service.ts');

async function check(tracks, fileIndices, flags = {}) {
  const service = Object.create(ReleasesService.prototype);
  const uploads = [];
  const events = [];
  let savedRows;
  service.getNextManualDiscogsId = async () => -1;
  service.findOne = async (id, audio) => {
    assert.equal(id, 'new-release');
    assert.equal(audio, true);
    events.push('details');
    return { id };
  };
  service.prisma = {
    user: { upsert: async () => ({}) },
    release: { create: async query => {
      assert.equal(query.data.isMix, flags.isMix === 'true' || flags.isOriginal === 'true');
      assert.equal(query.data.isOriginal, flags.isOriginal === 'true');
      savedRows = query.data.tracks.create;
      assert.equal(new Set(savedRows.map(track => track.id)).size, tracks.length);
      for (const track of savedRows) assert.equal(typeof track.id, 'string');
      events.push('release');
      // Nested tracks need not be returned at all: IDs are fixed before saving.
      return { id: 'new-release' };
    } },
  };
  service.audioService = { uploadAudio: async (file, input) => {
    events.push('audio');
    uploads.push({ file, input });
  } };
  const files = fileIndices.map(index => ({ fieldname: `audio-${index}`, originalname: `${index}.mp3` }));
  const result = await service.createManualRelease({ id: 'owner' }, {
    artist: 'Artist', title: 'Release', tracks: JSON.stringify(tracks), ...flags,
  }, files);
  assert.equal(result.id, 'new-release');
  assert.equal(uploads.length, files.length);
  for (const { file, input } of uploads) {
    const index = Number(file.fieldname.slice('audio-'.length));
    assert.equal(input.trackId, savedRows[index].id, `${file.fieldname} must stay on its own row`);
    assert.equal(input.userId, 'owner');
    assert.equal(savedRows[index].title, tracks[index].title.trim());
    assert.equal(savedRows[index].position, tracks[index].position?.trim() || String(index + 1));
  }
  assert.equal(events[0], 'release');
  assert.equal(events.at(-1), 'details');
  return savedRows;
}

async function main() {
  await check([{ position: 'B1', title: 'B track' }, { position: 'A1', title: 'A track' }], [0, 1]);
  await check([{ position: 'C1', title: 'Second vinyl A' }, { position: 'B1', title: 'First vinyl B' },
    { position: 'D1', title: 'Second vinyl B' }, { position: 'A1', title: 'First vinyl A' }], [0, 1, 2, 3]);
  await check(Array.from({ length: 12 }, (_, index) => ({ title: `Track ${index + 1}` })),
    Array.from({ length: 12 }, (_, index) => index));
  await check([{ position: 'A10', title: 'Ten' }, { position: 'A2', title: 'Two' },
    { position: 'A1', title: 'One' }], [0, 2]);
  await check([{ position: 'A1', title: 'No audio' }], []);
  await check([{ position: 'A1', title: 'Mix' }], [0], { isMix: 'true' });
  const rows = await check([{ position: ' A1 ', title: ' Original ', artist: ' Solo ', bpm: '125', key: ' Am ' }],
    [0], { isOriginal: 'true' });
  assert.deepEqual(rows[0].artists, ['Solo']);
  assert.equal(rows[0].bpm, 125);
  assert.equal(rows[0].key, 'Am');

  const failing = Object.create(ReleasesService.prototype);
  let uploads = 0;
  failing.getNextManualDiscogsId = async () => -1;
  failing.prisma = { user: { upsert: async () => ({}) }, release: { create: async () => { throw Error('Database failed'); } } };
  failing.audioService = { uploadAudio: async () => { uploads++; } };
  await assert.rejects(() => failing.createManualRelease({ id: 'owner' }, {
    artist: 'Artist', title: 'Release', tracks: '[{"position":"B1","title":"Track"}]',
  }, [{ fieldname: 'audio-0' }]), /Database failed/);
  assert.equal(uploads, 0);
  console.log('PASS: stable MP3 row IDs, reversed A/B order, C/D, 12 numeric tracks, A10/A2, partial/no audio, mixes/originals and database failure');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
