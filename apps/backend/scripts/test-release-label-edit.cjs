const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../src/modules/releases/releases.service.ts'), 'utf8');
const body = source.split('async updateReleaseMetadata(id: string, dto: UpdateReleaseMetadataDto) {')[1]
  .split('\n  async updateTrackMetadata(')[0].replace(/\}\s*$/, '')
  .replace('const data: Prisma.ReleaseUpdateInput = {};', 'const data = {};');
const update = new Function('id', 'dto', 'BadRequestException', `return (async()=>{${body}})()`);
(async () => {
  let stored = { artist: 'Artist', title: 'Release', year: 2000, labels: ['Old label'] };
  const context = { prisma: { release: { update: async ({ data }) => (stored = { ...stored, ...data }) } }, signReleaseUrls: value => value };
  await update.call(context, 'release', { labels: [' New label ', 'Other', 'New label', ' '] }, Error);
  assert.deepEqual(stored, { artist: 'Artist', title: 'Release', year: 2000, labels: ['New label', 'Other'] });
  await update.call(context, 'release', { artist: 'Changed' }, Error);
  assert.deepEqual(stored.labels, ['New label', 'Other']);
  await update.call(context, 'release', { labels: [] }, Error);
  assert.deepEqual(stored.labels, []);
  for (const labels of [null, 'Wrong', [7], ['a'.repeat(201)], Array(31).fill('Label')]) {
    await assert.rejects(update.call(context, 'release', { labels }, Error));
  }
  console.log('PASS: label edits trim/deduplicate, clear explicitly, preserve unrelated/omitted fields and reject invalid payloads');
})().catch(error => { console.error(error); process.exitCode = 1; });
