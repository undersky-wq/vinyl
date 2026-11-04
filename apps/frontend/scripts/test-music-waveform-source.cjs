const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');

const source = fs.readFileSync(path.join(__dirname, '../src/components/shelf-mix-track.tsx'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
} }).outputText;

for (const isOriginal of [false, true]) {
  const effects = [];
  const values = [];
  const listeners = new Map();
  const oldSource = 'https://example.test/audio/old.mp3';
  const expectedSource = 'https://example.test/audio/new.mp3';
  const audio = {
    src: oldSource, currentSrc: oldSource, readyState: 4, seeking: false,
    currentTime: 90, duration: 100,
    addEventListener: (name, fn) => listeners.set(name, fn),
    removeEventListener: name => listeners.delete(name),
  };
  const hooks = {
    ...React,
    useState: initial => {
      const index = values.length;
      values.push(initial);
      return [initial, value => { values[index] = value; }];
    },
    useMemo: fn => fn(), useRef: current => ({ current }),
    useEffect: fn => effects.push(fn),
  };
  const exports = {};
  vm.runInNewContext(compiled, {
    exports, URL, document: { baseURI: 'https://example.test/tracks' },
    window: { addEventListener() {}, removeEventListener() {} },
    require: name => {
      if (name === 'react') return hooks;
      if (name === 'next/navigation') return { useRouter: () => ({}) };
      if (name === '../providers/auth-provider') return { useAuth: () => ({ user: null }) };
      if (name === '../providers/favorites-provider') return { useFavorites: () => ({ isFavorite: () => false }) };
      if (name === '../providers/player-provider') return {
        usePlayerTransport: () => ({ currentTrack: { releaseId: 'new', audioUrl: '/audio/new.mp3' }, isPlaying: true }),
        usePlayerActions: () => ({ getAudioElement: () => audio }),
      };
      if (name === '../lib/music-engagement') return { getMusicEngagement: async () => ({}) };
      if (name === '../lib/api') return { getReleaseTimelineComments: async () => [] };
      if (name === '../lib/time') return { normalizeDurationLabel: () => '3:20', formatSecondsAsClock: String };
      if (name === '../lib/music-page-queue') return { musicPageQueue: () => [] };
      if (name === '../lib/waveform') return { buildFallbackWaveform: () => [], useResponsiveWaveform: () => ({ peaks: [], barStyle: {} }) };
      if (name.startsWith('.')) return {};
      return require(name);
    },
  });
  exports.ShelfMixTrack({
    release: { id: 'new', title: 'New', artist: 'Artist', styles: [], isOriginal,
      tracks: [{ id: 'track', audioUrl: '/audio/new.mp3', durationSec: 200 }] },
    lang: 'ru', actions: null,
  });
  const cleanups = effects.map(run => run());
  const position = () => [values[7], values[9], values[10]];
  assert.deepEqual(position(), [0, 0, 0], 'Previous source must not publish its position');
  audio.src = expectedSource;
  listeners.get('timeupdate')();
  assert.deepEqual(position(), [0, 0, 0], 'Assigned source may still have old currentSrc');
  audio.currentSrc = expectedSource;
  audio.readyState = 0;
  listeners.get('timeupdate')();
  assert.deepEqual(position(), [0, 0, 0], 'Wait for new metadata');
  Object.assign(audio, { readyState: 1, duration: 200, currentTime: 50 });
  listeners.get('loadedmetadata')();
  assert.deepEqual(position(), [25, 50, 200]);
  Object.assign(audio, { seeking: true, currentTime: 100 });
  listeners.get('timeupdate')();
  assert.deepEqual(position(), [25, 50, 200], 'Do not overwrite a pending seek');
  audio.seeking = false;
  listeners.get('seeked')();
  assert.deepEqual(position(), [50, 100, 200]);
  cleanups.forEach(cleanup => cleanup?.());
  assert.equal(listeners.size, 0);
  console.log(`PASS: ${isOriginal ? 'Tracks' : 'Mixes'} waveform waits for the correct audio source`);
}
