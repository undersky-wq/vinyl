const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
function load(name, dependencies, fetch) {
  const module = { exports: {} };
  const source = ts.transpileModule(read(name), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  new Function('require', 'module', 'exports', 'fetch', source)(key => {
    if (!(key in dependencies)) throw Error(`Unexpected import ${key}`);
    return dependencies[key];
  }, module, module.exports, fetch);
  return module.exports;
}
(async () => {
  const stored = new Map(); const calls = []; const clipboard = [];
  const service = () => load('src/lib/music-engagement.ts', {
    'expo-clipboard': { setStringAsync: async value => clipboard.push(value) },
    'expo-file-system/legacy': { documentDirectory: 'device/', readAsStringAsync: async key => { if (!stored.has(key)) throw Error('missing'); return stored.get(key); }, writeAsStringAsync: async (key, value) => stored.set(key, value) },
    './api': { fetchJson: async (url, init) => { calls.push({ url, body: init?.body && JSON.parse(init.body) }); return {}; } },
  }, async () => ({ ok: true, json: async () => ({ path: '/tracks/artist-title' }) }));
  const first = service();
  await first.recordMusicPlay('one'); await first.recordMusicPlay('two');
  assert.match(calls[0].body.sessionId, /^[a-f0-9]{36}$/);
  assert.equal(calls[0].body.sessionId, calls[1].body.sessionId, 'stable device identity; release and account dedup belong to server');
  await service().recordMusicPlay('one');
  assert.equal(calls[0].body.sessionId, calls[2].body.sessionId, 'identity survives restart');
  assert.equal(await first.copyMusicLink('one'), 'https://mityadima.ru/tracks/artist-title');
  assert.equal(clipboard[0], 'https://mityadima.ru/tracks/artist-title');
  assert.equal(calls.at(-1).body.requestId, calls[0].body.sessionId);
  const badClipboard = load('src/lib/music-engagement.ts', {
    'expo-clipboard': { setStringAsync: async () => { throw Error('clipboard failed'); } },
    'expo-file-system/legacy': {}, './api': { fetchJson: async () => { throw Error('must not count failed copy'); } },
  }, async () => { throw Error('offline'); });
  await assert.rejects(() => badClipboard.copyMusicLink('one'), /clipboard failed/);
  const home = read('src/screens/HomeScreen.tsx');
  assert(home.includes("{mode === 'grid' &&"), 'Grid mounts before the animation handoff');
  assert(home.includes("{mode === 'tracks' &&"), 'Tracks does not mount the legacy canvas first');
  assert(home.includes("{ isOriginal: true } : { isMix: true }"));
  assert(home.includes("section !== 'favorites' ?"));
  const full = read('src/components/FullPlayer.tsx');
  assert(full.includes('<MusicComments'), 'full player and timeline cards use one comment component');
  assert(!full.includes('<TrackDownloadButton track={track}'), 'download action removed from full player main toolbar');
  assert(full.includes('engagement.favorites > 0') && full.includes('comments.length > 0'));
  const comments = read('src/components/MusicComments.tsx');
  assert(comments.includes('(comment.likeCount || 0) > 0'));
  assert(comments.includes('onSeek(comment.second)'));
  console.log('PASS: persisted music identity, readable clipboard links, failed-copy safety, section feeds and native parity guards');
})().catch(error => { console.error(error); process.exitCode = 1; });
