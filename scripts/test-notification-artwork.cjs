const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('../apps/mobile/node_modules/typescript');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../apps/mobile/src/lib/notification-artwork.ts'), 'utf8');
const code = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
}).outputText;

function harness(cache) {
  let active;
  const writes = [];
  const player = {
    getActiveTrack: async () => active,
    updateNowPlayingMetadata: async (metadata) => { writes.push(metadata); },
    updateMetadataForTrack: () => { throw new Error('Must not replace playing queue items for artwork'); },
  };
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', code)((name) => {
    if (name === 'react-native-track-player') return player;
    if (name === './artwork-cache') return { getLockScreenArtworkUrl: cache };
    throw new Error(name);
  }, mod, mod.exports);
  return { ...mod.exports, writes, select: (id) => { active = id ? { id, title: id, artist: 'Artist', artwork: `https://example.test/${id}.webp`, duration: 240 } : undefined; } };
}

(async () => {
  let releaseA;
  const aDownload = new Promise(resolve => { releaseA = resolve; });
  const app = harness(async id => id === 'a' ? aDownload : `file:///${id}.webp`);
  app.select('a');
  const pending = app.syncNotificationArtwork();
  await new Promise(resolve => setImmediate(resolve));
  app.select('b');
  app.syncNotificationArtwork(true);
  releaseA('file:///a.webp');
  await pending;
  assert.equal(app.writes.length, 1);
  assert.equal(app.writes[0].title, 'b');
  assert.equal(app.writes[0].artwork, 'file:///b.webp');
  await app.syncNotificationArtwork();
  assert.equal(app.writes.length, 1, 'Pause/play state events must not reload the same image');
  await app.syncNotificationArtwork(true);
  assert.equal(app.writes.length, 2, 'Restarting the same track must republish notification metadata');
  app.select();
  await app.syncNotificationArtwork(true);
  assert.equal(app.writes.length, 2, 'Empty queue must not publish stale artwork');

  let calls = 0;
  const retry = harness(async id => ++calls === 1 ? `https://example.test/${id}.webp` : `file:///${id}.webp`);
  retry.select('mix');
  await retry.syncNotificationArtwork();
  await retry.syncNotificationArtwork();
  assert.equal(retry.writes[1].artwork, 'file:///mix.webp');
  console.log('PASS: background metadata sync, late artwork ignored, duplicate states deduplicated, same-track restart, empty queue, failed-download retry.');
})().catch(error => { console.error(error); process.exitCode = 1; });
