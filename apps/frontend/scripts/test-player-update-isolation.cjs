const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../../..');
const frontRequire = require;
const assert = require('node:assert/strict');
const ts = frontRequire('typescript');
const React = frontRequire('react');

function load(relative, customRequire, globals = {}) {
  const source = fs.readFileSync(path.join(root, relative), 'utf8');
  const exports = {};
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
    experimentalDecorators: true, emitDecoratorMetadata: false, esModuleInterop: true,
  } }).outputText;
  vm.runInNewContext(compiled, { exports, require: customRequire, ...globals });
  return exports;
}

async function main() {
  const stableAuth = { requirePlayback: () => true };
  let slot = 0, stateSlot = 0, clock = 0;
  const cache = [];
  function memo(fn, deps) {
    const index = slot++;
    const previous = cache[index];
    if (previous && deps && deps.length === previous.deps?.length && deps.every((v, i) => Object.is(v, previous.deps[i]))) return previous.value;
    const value = fn();
    cache[index] = { deps, value };
    return value;
  }
  const playerHooks = {
    ...React, useState: initial => [stateSlot++ === 6 ? clock : initial, () => {}], useEffect: () => {},
    useMemo: memo, useCallback: (fn, deps) => memo(() => fn, deps), useRef: current => ({ current }),
  };
  const { PlayerProvider } = load('apps/frontend/src/providers/player-provider.tsx', name => {
    if (name === 'react') return playerHooks;
    if (name === './auth-provider') return { useAuth: () => stableAuth };
    if (name === '../lib/shuffle-cycle') return { createShuffleCycle: () => ({ reset() {} }) };
    if (name === '../lib/player-storage') return { preparePlayerState: () => null };
    if (name.startsWith('.')) return {};
    return frontRequire(name);
  });
  const BrowserPlayerProvider = PlayerProvider({ children: null }).type;
  stateSlot = 0;
  const first = BrowserPlayerProvider({ children: null });
  slot = stateSlot = 0;
  clock = 12;
  const second = BrowserPlayerProvider({ children: null });
  const firstActions = first.props.children.props.children.props.value;
  const secondActions = second.props.children.props.children.props.value;
  assert.equal(second.props.children.props.value.currentTime, 12);
  assert.equal(first.props.value, second.props.value);
  assert.equal(firstActions, secondActions);

  const mixEffects = [];
  const counterRequests = [];
  const listeners = [];
  const { ShelfMixTrack } = load('apps/frontend/src/components/shelf-mix-track.tsx', name => {
    if (name === 'react') return { ...playerHooks, useEffect: fn => mixEffects.push(fn) };
    if (name === 'next/navigation') return { useRouter: () => ({}) };
    if (name === '../providers/auth-provider') return { useAuth: () => ({ user: null }) };
    if (name === '../providers/favorites-provider') return { useFavorites: () => ({ favoriteTrackIds: [] }) };
    if (name === '../providers/player-provider') return {
      usePlayerTransport: () => ({ currentTrack: null, isPlaying: false }),
      usePlayerActions: () => ({ getAudioElement: () => null }),
    };
    if (name === '../lib/music-engagement') return { getMusicEngagement: async id => { counterRequests.push(id); return {}; } };
    if (name === '../lib/api') return { getReleaseTimelineComments: async () => [] };
    if (name === '../lib/music-page-queue') return { musicPageQueue: () => [] };
    if (name === '../lib/waveform') return { buildFallbackWaveform: () => [], useResponsiveWaveform: () => ({ peaks: [], barStyle: {} }) };
    if (name.startsWith('.')) return {};
    return frontRequire(name);
  }, { window: { addEventListener: (name, fn) => listeners.push([name, fn]), removeEventListener() {} } });
  for (let index = 0; index < 3; index++) ShelfMixTrack({ release: { id: 'release-' + index, title: 'test', tracks: [] }, lang: 'ru' });
  mixEffects.forEach(run => run());
  await Promise.resolve();
  counterRequests.length = 0;
  listeners.filter(([name]) => name === 'music-engagement').forEach(([, fn]) => fn({ detail: 'release-0' }));
  await Promise.resolve();
  assert.deepEqual(counterRequests, ['release-0']);
  console.log('PASS: progress does not invalidate transport/actions; engagement refresh targets one release');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
