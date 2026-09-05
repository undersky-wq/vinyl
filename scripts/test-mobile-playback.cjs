// node scripts/test-mobile-playback.cjs (requires apps/mobile npm dependencies)
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('../apps/mobile/node_modules/typescript');
const root = path.resolve(__dirname, '..');
function compile(source, filename, mocks) {
  const code = ts.transpileModule(source, {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)((name) => mocks[name] || {}, module, module.exports);
  return module.exports;
}
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const helpers = compile(read('apps/mobile/src/lib/playback-queue.ts'), 'queue.ts', {});
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const tick = () => new Promise((resolve) => setImmediate(resolve));
async function until(predicate) {
  for (let i = 0; i < 100; i++) { if (predicate()) return; await tick(); }
  throw new Error('Condition did not settle');
}
const track = (id) => ({ id, audioUrl: `https://example.test/${id}.mp3`, title: id, artist: 'Artist', coverUrl: '', releaseId: 'release' });

// Exercise the actual App functions, replacing just React/native/network dependencies.
function harness(options = {}) {
  const calls = [];
  let queue = [], active, checks = 0, refreshes = 0;
  const native = {
    position: 0, playing: false,
    setupPlayer: async () => {}, updateOptions: async () => {}, addEventListener: () => ({ remove() {} }),
    getQueue: async () => queue.slice(), getActiveTrack: async () => active,
    getActiveTrackIndex: async () => queue.indexOf(active),
    updateMetadataForTrack: async () => {},
    reset: async () => { calls.push(['reset']); queue = []; active = undefined; native.position = 0; native.playing = false; },
    add: async (tracks, before) => { calls.push(['add', tracks.length]); queue.splice(before ?? queue.length, 0, ...tracks); active ||= queue[0]; },
    skip: async (index) => { calls.push(['skip']); active = queue[index]; native.position = 0; },
    remove: async (indexes) => { assert.ok(!indexes.includes(queue.indexOf(active)), 'Must not remove playing item'); queue = queue.filter((_, i) => !indexes.includes(i)); },
    play: async () => { calls.push(['play', active.id]); native.playing = true; },
    pause: async () => { native.playing = false; },
    seekTo: async (seconds) => { calls.push(['seek']); native.position = seconds; },
  };
  const source = read('apps/mobile/App.tsx');
  const ast = ts.createSourceFile('App.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const appNode = ast.statements.find((n) => ts.isFunctionDeclaration(n) && n.name?.text === 'App');
  const returnNode = appNode.body.statements.find(ts.isReturnStatement);
  const instrumented = source.slice(0, returnNode.getStart(ast)) +
    'return { playTrack, setTrackForPlayback, queueRef, currentTrackRef, desiredPlayingRef, positionMsRef, playbackRequestsRef, playbackRequestIdRef };' + source.slice(returnNode.end);
  const mod = compile(instrumented, 'App.tsx', {
    react: {
      useRef: (current) => ({ current }),
      useState: (initial) => [initial, () => {}],
      useEffect() {},
      useMemo: (factory) => factory(),
    },
    'react-native': { StyleSheet: { create: (value) => value, absoluteFillObject: {} } },
    'react-native-track-player': { default: native, Capability: { Play: 1 }, Event: { PlaybackProgressUpdated: 1 }, State: { Playing: 1 }, AppKilledPlaybackBehavior: { PausePlayback: 1 } },
    'react/jsx-runtime': {
      Fragment: Symbol('Fragment'),
      jsx: (type, props) => ({ type, props }),
      jsxs: (type, props) => ({ type, props }),
    },
    './src/theme': { colors: {}, spacing: {}, radius: {} },
    './src/lib/playback-queue': helpers,
    './src/lib/artwork-cache': { getLockScreenArtworkUrl: async (id) => `file:///artwork/${id}.webp` },
    './src/lib/retriable-resource': {
      createRetriableResource: () => ({ load: async () => true, hasLoaded: () => true }),
    },
    './src/lib/offline-audio': {
      resolveOfflineTrack: async (value) => { checks++; return options.resolveOffline ? options.resolveOffline(value) : value; },
      withCachedOfflineAudio: (value) => value,
      warmOfflineAudioIndex: async () => {},
    },
    './src/lib/api': { refreshPlayerTrack: async (id) => { refreshes++; return track(id); } },
  });
  return { app: mod.default(), native, calls, get queue() { return queue; }, get checks() { return checks; }, get refreshes() { return refreshes; } };
}

async function main() {
  const a = track('a'), b = track('b'), x = track('x');
  const full = deferred();
  let requested = false;
  const h = harness();
  await h.app.playTrack(a, [a, b], [a], () => { requested = true; return full.promise; });
  assert.deepEqual(h.calls.slice(0, 4), [['reset'], ['add', 1], ['skip'], ['play', 'a']]);
  assert.equal(h.checks, 1, 'Only selected file is checked before playback');
  assert.equal(h.refreshes, 0, 'Known playable URL does not need a network refresh');
  await until(() => requested);
  assert.equal(h.native.playing, true, 'Playback starts while full queue response is pending');
  h.native.position = 47;
  h.native.playing = false;
  h.app.desiredPlayingRef.current = false;
  const many = [x, a, b, ...Array.from({ length: 1197 }, (_, i) => track(`other-${i}`))];
  full.resolve(many);
  await until(() => h.app.queueRef.current.length === 1200);
  assert.equal(h.native.position, 47, 'Queue expansion must not seek');
  assert.equal(h.native.playing, false, 'Queue expansion must preserve pause');
  assert.equal(h.checks, 1, 'Full queue expansion must not stat 1200 files');
  assert.equal(h.calls.filter(([name]) => name === 'reset').length, 1);
  assert.equal(h.calls.filter(([name]) => name === 'play').length, 1);
  assert.deepEqual(h.queue.map((item) => item.id), many.map((item) => item.id));

  // An old response after a new click cannot replace the new queue.
  const oldQueue = deferred();
  let oldRequested = false;
  const rapid = harness();
  await rapid.app.playTrack(a, [a], [a], () => { oldRequested = true; return oldQueue.promise; });
  await until(() => oldRequested);
  await rapid.app.playTrack(b, [b], [b]);
  oldQueue.resolve([a, x]);
  await tick(); await tick();
  assert.equal(rapid.app.currentTrackRef.current.id, 'b');
  assert.deepEqual(rapid.queue.map((item) => item.id), ['b']);

  // A slow local check from the first click cannot start A after B was requested.
  const local = deferred();
  const race = harness({ resolveOffline: (value) => value.id === 'a' ? local.promise : value });
  const first = race.app.playTrack(a, [a]);
  await until(() => race.checks === 1);
  const second = race.app.playTrack(b, [b]);
  local.resolve(a);
  await Promise.all([first, second]);
  assert.deepEqual(race.calls.filter(([name]) => name === 'play'), [['play', 'b']]);

  // Offline/full queue request failure leaves the page queue playing.
  const unavailable = harness();
  await unavailable.app.playTrack(a, [a, b], [a], () => Promise.reject(new Error('expected test: no network')));
  await until(() => unavailable.queue.length === 2);
  await tick();
  assert.equal(unavailable.native.playing, true);
  assert.equal(unavailable.app.currentTrackRef.current.id, 'a');

  // Queue fetches are deduplicated, cached and retryable after errors.
  let fetches = 0;
  const response = deferred();
  const load = helpers.createQueueLoader(() => { fetches++; return response.promise; });
  const r1 = load(), r2 = load();
  assert.equal(fetches, 1);
  response.resolve([a]);
  await Promise.all([r1, r2]); await load();
  assert.equal(fetches, 1);
  let attempts = 0;
  const retry = helpers.createQueueLoader(async () => { if (++attempts === 1) throw new Error('retry'); return [b]; });
  await assert.rejects(retry());
  assert.deepEqual(await retry(), [b]);

  // Offline queue lookup uses one directory scan and synchronous cached lookups.
  let stats = 0, scans = 0;
  const offline = compile(read('apps/mobile/src/lib/offline-audio.ts'), 'offline.ts', {
    'expo-file-system/legacy': {
      documentDirectory: 'file:///data/',
      getInfoAsync: async () => { stats++; return { exists: true }; },
      readDirectoryAsync: async () => { scans++; return ['a.mp3', 'b.mp3.download']; },
    },
  });
  await Promise.all([offline.warmOfflineAudioIndex(), offline.warmOfflineAudioIndex()]);
  for (const value of many) offline.withCachedOfflineAudio(value);
  assert.equal(scans, 1); assert.equal(stats, 1);
  assert.equal(offline.withCachedOfflineAudio(a).localAudioUrl, 'file:///data/offline-audio/a.mp3');
  assert.equal(offline.withCachedOfflineAudio(b).localAudioUrl, null);
  console.log('PASS: immediate single-track start; background 1200-track queue; pause/position preserved; stale taps/responses ignored; network fallback; queue cache; bulk offline index.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
