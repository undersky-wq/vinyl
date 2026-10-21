const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const files = new Map();
let downloadCount = 0;
let status = 200;
let bytes = 'audio-bytes';
const fileSystem = {
  documentDirectory: 'file:///app/',
  getInfoAsync: async uri => files.has(uri) ? { exists: true, isDirectory: false, size: files.get(uri).length, modificationTime: 1 } : { exists: false },
  makeDirectoryAsync: async () => {},
  readDirectoryAsync: async directory => [...files.keys()].filter(key => key.startsWith(directory)).map(key => key.slice(directory.length)),
  writeAsStringAsync: async (uri, value) => { files.set(uri, value); },
  readAsStringAsync: async uri => { if (!files.has(uri)) throw Error('not found'); return files.get(uri); },
  deleteAsync: async uri => { files.delete(uri); },
  moveAsync: async ({ from, to }) => { if (!files.has(from)) throw Error('missing source'); files.set(to, files.get(from)); files.delete(from); },
  downloadAsync: async (_, uri) => { downloadCount++; files.set(uri, bytes); return { uri, status }; },
};
function load(relative, dependencies = {}) {
  const module = { exports: {} };
  const source = fs.readFileSync(path.join(__dirname, '../src/lib', relative), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'module', 'exports', compiled)(name => {
    if (name === 'expo-file-system/legacy') return fileSystem;
    if (name in dependencies) return dependencies[name];
    throw Error(`Unexpected dependency ${name}`);
  }, module, module.exports);
  return module.exports;
}
(async () => {
  let audio = load('offline-audio.ts');
  const track = { id: 'track/1', title: 'Offline title', artist: 'Artist', audioUrl: 'https://audio.invalid/private?signature=SECRET', coverUrl: '' };
  await Promise.all([audio.downloadTrackAudio(track), audio.downloadTrackAudio(track)]);
  assert.equal(downloadCount, 1, 'one transfer per track');
  assert(![...files.values()].some(value => value.includes('SECRET')), 'never persist a signed audio link');
  audio = load('offline-audio.ts');
  const restored = await audio.getDownloadedTracks();
  assert.equal(restored.length, 1);
  assert.equal(restored[0].title, track.title);
  assert(restored[0].audioUrl.startsWith('file:///'));
  bytes = '';
  await assert.rejects(audio.downloadTrackAudio({ ...track, id: 'empty' }));
  assert.equal(await audio.getOfflineAudioUri('empty'), null);
  bytes = 'audio'; status = 403;
  await assert.rejects(audio.downloadTrackAudio({ ...track, id: 'denied' }));
  assert.equal(await audio.getOfflineAudioUri('denied'), null);
  status = 200;
  const cache = load('offline-catalog.ts', { './offline-audio': audio });
  assert.equal(cache.isCatalogRequest('/auth/me'), false);
  assert.equal(cache.isCatalogRequest('/users'), false);
  assert.equal(cache.isCatalogRequest('/releases/r1/comments'), false);
  await cache.saveCatalog('/releases/r1', { id: 'r1', tracks: [{ id: track.id, audioFiles: [{ storageUrl: track.audioUrl }] }] });
  const cached = await cache.readCatalog('/releases/r1');
  assert.equal(cached.value.tracks[0].audioFiles[0].storageUrl, restored[0].audioUrl);
  await cache.saveCatalog('/releases/library-queue?', [{ ...track, id: 'not-downloaded' }]);
  assert.equal((await cache.readCatalog('/releases/library-queue?')).value[0].audioUrl, null);
  const api = load('api.ts', { 'expo-constants': { default: { expoConfig: { extra: { apiUrl: 'https://api.invalid' } } } }, './offline-catalog': cache });
  const originalFetch = global.fetch;
  try {
    global.fetch = async () => { throw Error('offline'); };
    assert.equal((await api.getRelease('r1')).tracks[0].id, track.id);
    await assert.rejects(api.getCurrentUser(), /offline/);
    global.fetch = async () => new Response('', { status: 401 });
    await assert.rejects(api.getRelease('r1'), /401/, 'no offline fallback for authorization failures');
  } finally { global.fetch = originalFetch; }
  console.log('PASS: persisted downloads, restart without network, duplicate transfers, empty/failed downloads, catalog fallback and authorization isolation (mock filesystem/network)');
})().catch(error => { console.error(error); process.exitCode = 1; });
