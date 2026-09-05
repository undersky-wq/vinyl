// Run: node scripts/test-player-palette.cjs. Native image decoding needs a new APK/device.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('../apps/mobile/node_modules/typescript');

function load(name, mocks) {
  const file = path.resolve(__dirname, '../apps/mobile/src/lib', name);
  const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  const loaded = { exports: {} };
  new Function('require', 'module', 'exports', output.outputText)((id) => {
    assert.ok(mocks[id], id);
    return mocks[id];
  }, loaded, loaded.exports);
  return loaded.exports;
}
const swatch = (color) => ({ platform: 'android', vibrant: color, dominant: color });
const nativeCalls = [];
let extract = async () => swatch('#2277dd');
const api = load('player-palette.ts', {
  'react-native-image-colors': { getColors: (uri) => { nativeCalls.push(uri); return extract(uri); } },
});
function rgb(hex) { return [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16)); }
function luminance(hex) {
  const [r, g, b] = rgb(hex).map((value) => value / 255).map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

async function test() {
  for (const color of ['#2266ff', '#ff2222', '#22ff66', '#ffff00', '#00ffff', '#ff00ff', '#ce8046']) {
    const palette = api.createPlayerPalette(swatch(color));
    assert.equal(palette.length, 3);
    for (const stop of palette) {
      assert.match(stop, /^#[0-9a-f]{6}$/);
      assert.ok((luminance('#dedee2') + 0.05) / (luminance(stop) + 0.05) >= 4.5, `Text contrast for ${color}: ${stop}`);
    }
    assert.equal(new Set(palette).size, 1, 'The full player uses one solid dominant color');
  }
  const blue = api.createPlayerPalette(swatch('#2266ff'));
  assert.ok(blue.every((hex) => { const [r, g, b] = rgb(hex); return b > g && b > r; }));
  for (const color of ['#ffffff', '#000000', '#888888', '#b8aaa4', 'invalid']) {
    assert.deepEqual(api.createPlayerPalette(swatch(color)), api.DEFAULT_PLAYER_PALETTE);
  }
  assert.deepEqual(
    api.createPlayerPalette({ platform: 'ios', background: '#fffFFF', primary: '#2266ff' }),
    api.DEFAULT_PLAYER_PALETTE,
    'A monochrome dominant background must not inherit a colorful accent swatch',
  );
  assert.deepEqual(api.createPlayerPalette({ platform: 'web', vibrant: '#2266ff' }), blue);
  assert.deepEqual(api.createPlayerPalette({ platform: 'android', vibrant: '#000000', dominant: '#2266ff' }), blue);

  let finish;
  extract = () => new Promise((resolve) => { finish = resolve; });
  const first = api.loadPlayerPalette('cover-a');
  const second = api.loadPlayerPalette('cover-a');
  assert.equal(first, second, 'Concurrent openings share one extraction');
  await new Promise(setImmediate);
  finish(swatch('#2266ff'));
  assert.deepEqual(await first, blue);
  assert.deepEqual(await api.loadPlayerPalette('cover-a'), blue);
  assert.deepEqual(nativeCalls, ['cover-a']);
  extract = async () => { throw new Error('offline'); };
  assert.deepEqual(await api.loadPlayerPalette('offline-cover'), api.DEFAULT_PLAYER_PALETTE);
  assert.equal(api.getCachedPlayerPalette('offline-cover'), undefined, 'Allow failed downloads to retry');
  extract = async () => swatch('#2266ff');
  assert.deepEqual(await api.loadPlayerPalette('offline-cover'), blue);
  for (let i = 0; i < 65; i++) await api.loadPlayerPalette(`other-${i}`);
  assert.equal(api.getCachedPlayerPalette('cover-a'), undefined, 'Bound cached artwork count');

  // Exercise the hook's effect lifecycle: close, rapid track change, stale reply and reopening.
  let state = null;
  let effect;
  let cleanup;
  let lastDependencies;
  let latestDependencies;
  const requests = [];
  const hook = load('use-cover-palette.ts', {
    react: {
      useState: () => [state, (value) => { state = value; }],
      useEffect: (fn, deps) => { effect = fn; latestDependencies = deps; },
    },
    './player-palette': {
      DEFAULT_PLAYER_PALETTE: api.DEFAULT_PLAYER_PALETTE,
      getCachedPlayerPalette: () => undefined,
      loadPlayerPalette: (uri) => new Promise((resolve) => { requests.push({ uri, resolve }); }),
    },
  });
  function render(uri, enabled = true) {
    const palette = hook.useCoverPalette(uri, enabled);
    if (!lastDependencies || latestDependencies.some((value, i) => value !== lastDependencies[i])) {
      if (cleanup) cleanup();
      cleanup = effect();
      lastDependencies = latestDependencies;
    }
    return palette;
  }
  render('a', false);
  assert.equal(requests.length, 0);
  assert.deepEqual(render('a'), api.DEFAULT_PLAYER_PALETTE);
  render('a');
  assert.equal(requests.length, 1, 'Progress renders must not extract colors again');
  render('b');
  requests[0].resolve(blue);
  await Promise.resolve();
  assert.equal(state, null, 'Ignore stale artwork replies');
  requests[1].resolve(blue);
  await Promise.resolve();
  assert.deepEqual(render('b'), blue);
  assert.deepEqual(render('c'), blue, 'Keep the previous color until the next cover is analysed');
  render('c', false);
  requests[2].resolve(blue);
  await Promise.resolve();
  assert.equal(state.uri, 'b', 'Closing cancels state updates');
  assert.deepEqual(render(undefined), api.DEFAULT_PLAYER_PALETTE);
  console.log('PASS: solid dominant colors, readable contrast, neutral monochrome fallback, cache/dedup/retry, rapid changes and hidden-player effects.');
}
test().catch((error) => { console.error(error); process.exitCode = 1; });
