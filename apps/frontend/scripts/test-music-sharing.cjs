const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.join(__dirname, '..', 'src');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const copy = read('components/copy-music-link.tsx');
assert(copy.includes('navigator.clipboard.writeText(url)'));
assert(!copy.includes('navigator.share'));
assert(copy.includes('3500') && copy.includes('clearTimeout(timer.current)'));
for (const file of ['shelf-mix-track', 'player-mix-actions', 'mixes-browser', 'release-detail']) {
  const source = read(`components/${file}.tsx`);
  assert(source.includes('CopyMusicLink'), file);
  assert(!source.includes('navigator.share') && !source.includes('<MixShareSheet'), file);
}
const entry = read('components/shared-music-entry.tsx');
assert(entry.includes('ShelfMixDetail') && !entry.includes('PlayerPageClient'));
assert(read('components/shelf-mix-detail.tsx').includes('yearInHeading timelineControls commentsAlwaysOpen'));
const detail = read('components/shelf-mix-detail.tsx');
assert(detail.includes('<ArchivePageHeader') && read('components/paper-archive.tsx').includes('<ArchivePageHeader'));
assert(detail.includes('useCollectionCounts()'));
for (const count of ['releases', 'playlists', 'mixes', 'originals', 'favorites']) assert(detail.includes(`counts.${count}`));
const timeline = read('components/shelf-mix-track.tsx');
assert(timeline.indexOf('<CopyMusicLink') < timeline.indexOf('paper-mix-heading'));
assert(timeline.includes('!commentsAlwaysOpen ?'));
const metadata = read('lib/music-metadata.ts');
assert(metadata.includes('/share-image') && metadata.includes('openGraph:') && metadata.includes('twitter:'));
const metadataExports = {};
vm.runInNewContext(ts.transpileModule(metadata, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {exports:metadataExports,process:{env:{}},URL});
const preview = metadataExports.musicMetadata({id:'test',artist:'Artist',title:'Track title',year:2025,isOriginal:true,styles:['House']}, '/tracks/test');
assert.equal(preview.openGraph.title, 'Artist - Track title');
assert.equal(preview.description, 'Трек · 2025 · House');
assert(!preview.description.includes('Artist') && !preview.description.includes('Track title') && !preview.description.includes('MityaDima'));

async function routeTest(cover, status, contentType = 'image/jpeg') {
  const exports = {};
  let fetched = false;
  vm.runInNewContext(ts.transpileModule(read('app/releases/[id]/share-image/route.ts'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
    exports, require: () => ({ getRelease: async () => ({ coverMediumStorageUrl: cover }) }),
    process: { env: {} }, URL, Response, AbortSignal,
    fetch: async () => { fetched = true; return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': contentType } }); },
  });
  const response = await exports.GET(new Request('https://mityadima.ru'), { params: Promise.resolve({ id: 'test' }) });
  assert.equal(response.status, status);
  if (status === 200) { assert.equal(fetched, true); assert.equal(response.headers.get('content-type'), contentType); }
  return fetched;
}
(async () => {
  await routeTest('https://s3.ru-7.storage.selcloud.ru/covers/test.jpg?signature=temporary', 200);
  assert.equal(await routeTest('http://127.0.0.1/private', 404), false);
  assert.equal(await routeTest('https://example.com/private', 404), false);
  await routeTest('https://i.discogs.com/cover.jpg', 404, 'text/html');
  console.log('PASS: copy-only sharing, timed notice, genre-row sharing, permalink comments, stable OG image and origin checks');
})().catch(error => { console.error(error); process.exit(1); });
