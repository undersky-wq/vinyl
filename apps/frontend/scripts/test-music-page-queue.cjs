const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.join(__dirname, '..', 'src');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const exportsObject = {};
vm.runInNewContext(ts.transpileModule(read('lib/music-page-queue.ts'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { exports: exportsObject });
const release = (id, audioUrl, isOriginal = false) => ({
  id, artist: `Artist ${id}`, title: id, isMix: true, isOriginal,
  coverStorageUrl: `${id}.jpg`, tracks: [{ id: `track-${id}`, title: id, audioUrl }],
});
const queue = exportsObject.musicPageQueue([
  release('first', '/first.mp3'), release('locked', ''), release('second', '/second.mp3', true), release('third', '/third.mp3'),
]);
assert.equal(queue.map(track => track.id).join(','), 'track-first,track-second,track-third');
const startIndex = queue.findIndex(track => track.id === 'track-second');
assert.equal(startIndex, 1);
assert.equal(queue[startIndex + 1].id, 'track-third');
assert.equal(queue[startIndex - 1].id, 'track-first');
assert.equal(queue[startIndex].isOriginal, true);
assert.equal(queue[startIndex].releaseId, 'second');
assert.equal(queue[startIndex].coverFullUrl, 'second.jpg');
assert.equal(exportsObject.musicPageQueue([release('favorite', '/favorite.mp3')]).length, 1);
const timeline = read('components/shelf-mix-track.tsx');
assert(timeline.includes('playQueue(queue,queueIndex,queue)'));
assert(timeline.includes('playQueueAtPercent(queue,queueIndex,percent)'));
assert(!timeline.includes('replaceQueuePreservingCurrent'));
const archive = read('components/paper-archive.tsx');
const collectionExports = {};
vm.runInNewContext(ts.transpileModule(read('lib/collection-playback-queue.ts'), {
  compilerOptions: {module:ts.ModuleKind.CommonJS},
}).outputText, {exports:collectionExports});
const ordered = collectionExports.orderCollectionQueue([
  {id:'b2',releaseId:'b',position:'B2',audioUrl:'/b2'},
  {id:'a10',releaseId:'a',position:'A10',audioUrl:'/a10'},
  {id:'a2',releaseId:'a',position:'A2',audioUrl:'/a2'},
  {id:'locked',releaseId:'b',audioUrl:''},
  {id:'excluded',releaseId:'excluded',audioUrl:'/other'},
], ['a','b']);
assert.equal(ordered.map(track=>track.id).join(','),'a2,a10,b2');
const canExtend = collectionExports.canExtendCollectionQueue;
assert.equal(canExtend({id:'a2'}, 'a2', ['a','b']), true);
assert.equal(canExtend({id:'b2',releaseId:'b',playbackSource:{section:'collection'}}, 'a2', ['a','b']), true);
assert.equal(canExtend({id:'b2',releaseId:'b',playbackSource:{section:'favorites'}}, 'a2', ['a','b']), false);
assert.equal(canExtend({id:'c1',releaseId:'c',playbackSource:{section:'collection'}}, 'a2', ['a','b']), false);
assert.equal(canExtend(null, 'a2', ['a','b']), false);
assert(archive.includes('const queue = releases.flatMap'));
assert(archive.includes('getCollectionPlaybackQueue()'));
assert(archive.includes('replaceCollectionQueueRef.current(fullQueue'));
assert(archive.includes('collectionReleaseIds, currentTrack'));
const active = {id:'playing',releaseId:'removed',audioUrl:'/playing',playbackSource:{section:'collection'}};
const live = collectionExports.liveCollectionQueue([
  {id:'a',releaseId:'one',audioUrl:'/a'},
  {id:'b',releaseId:'two',audioUrl:'/b'},
], ['two'], active);
assert.equal(live.map(track=>track.id).join(','),'playing,b');
assert.equal(live[0].id, active.id);
assert.equal(live[0].queueAnchorOnly, true);
assert.equal(collectionExports.liveCollectionQueue([],[],active).length,1);
const changed = collectionExports.liveCollectionQueue([
  {id:'a',releaseId:'one',audioUrl:'/a'},
  {id:'b',releaseId:'two',audioUrl:'/b'},
], ['one','two'], active);
assert.equal(changed.map(track=>track.id).join(','),'playing,a,b');
assert(archive.includes('queueReleases={releases}'));
console.log('PASS: page order, selected start index, next/previous, locked audio excluded, originals metadata and independent favorites queue');
