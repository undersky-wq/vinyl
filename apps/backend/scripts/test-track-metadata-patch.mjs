import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/modules/releases/releases.service.ts', import.meta.url), 'utf8');
const body = source.split('async updateTrackMetadata(trackId: string, dto: UpdateTrackMetadataDto) {')[1]
  .split('\n  async createTrack(')[0].replace(/\}\s*$/, '')
  .replace('const data: Prisma.TrackUpdateInput = {};', 'const data = {};');
const patch = new Function('trackId', 'dto', 'BadRequestException', body);
let stored = { bpm: 125, key: '8A', title: 'Track', artists: ['Artist'] };
const context = { prisma: { track: { update: ({ data }) => {stored = {...stored, ...data};return stored;} } } };
const emptyDto = () => ({bpm:undefined,key:undefined,title:undefined,artists:undefined});
patch.call(context, 'track', {...emptyDto(), bpm:130}, Error);
assert.equal(stored.bpm,130);
assert.equal(stored.key,'8A');
assert.deepEqual(stored.artists,['Artist']);
patch.call(context, 'track', {...emptyDto(), key:'9A'}, Error);
assert.equal(stored.bpm,130);
assert.equal(stored.key,'9A');
patch.call(context, 'track', {...emptyDto(), bpm:null}, Error);
assert.equal(stored.bpm,null);
assert.equal(stored.key,'9A');
patch.call(context, 'track', {...emptyDto(), key:null}, Error);
assert.equal(stored.key,null);
assert.equal(stored.title,'Track');
console.log('PASS: BPM/Key patches preserve omitted fields and allow explicit clearing');
