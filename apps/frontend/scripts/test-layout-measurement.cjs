const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.join(__dirname, '../src');
const frames = new Map();
let nextFrame = 0;
let observed;
class Observer {
  constructor(callback) { this.callback = callback; observed = this; this.nodes = []; }
  observe(node) { this.nodes.push(node); }
  disconnect() { this.disconnected = true; }
}
const globals = {
  requestAnimationFrame: callback => { const id = ++nextFrame; frames.set(id, callback); return id; },
  cancelAnimationFrame: id => frames.delete(id), ResizeObserver: Observer, MutationObserver: Observer,
};
function load(file, mocks = {}, extra = {}) {
  const exports = {};
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
  } }).outputText, { exports, ...globals, ...extra, require: name => name in mocks ? mocks[name] : require(name) });
  return exports;
}
const { frameMeasurement, setLayoutProperties, observeCardHeights } = load('lib/layout-measurement.ts');
let measures = 0;
const task = frameMeasurement(() => measures++);
for (let count = 0; count < 20; count++) task.schedule();
assert.equal(frames.size, 1, 'Merge resize bursts into one frame');
for (const [id, callback] of frames) { frames.delete(id); callback(); }
assert.equal(measures, 1);
task.schedule(); task.cancel();
assert.equal(frames.size, 0, 'Dispose queued measurements');
const properties = new Map(); let writes = 0;
const element = { style: { getPropertyValue: name => properties.get(name) || '', setProperty: (name, value) => { writes++; properties.set(name, value); } } };
setLayoutProperties(element, { '--cover': '160px', '--mobile-nav-top': '100px' });
for (let count = 0; count < 20; count++) setLayoutProperties(element, { '--cover': '160px', '--mobile-nav-top': '100px' });
assert.equal(writes, 2, 'Do not invalidate identical styles repeatedly');
setLayoutProperties(element, { '--cover': '170px' });
assert.equal(writes, 3);

let reads = 0;
const cards = [100, 200].map((height, index) => ({ dataset: { releaseId: `r${index}` }, get offsetHeight() { reads++; return height; } }));
const updates = [];
const stop = observeCardHeights(cards, 120, heights => updates.push({ ...heights }));
assert.deepEqual(updates[0], { r0: 120, r1: 200 });
assert.equal(reads, 2);
observed.callback([{ target: cards[1], borderBoxSize: [{ blockSize: 230.4 }] }]);
assert.deepEqual(updates[1], { r1: 230 });
assert.equal(reads, 2, 'Read changed card size from observer rather than measuring all cards');
observed.callback([{ target: cards[0], borderBoxSize: [] }]);
assert.equal(reads, 3, 'Fallback for browsers without border-box entries');
stop(); assert.equal(observed.disconnected, true);

// Exercise the real motion hook with a read/write log: every style read must
// happen before the first animate() call, including on About transitions.
const log = [];
let layout = 'shelf', about = false, cleanup;
const rect = { x: 0, y: 0, width: 100, height: 40 };
const parts = Array.from({ length: 3 }, (_, index) => ({
  getBoundingClientRect: () => { log.push(`rect${index}`); return rect; },
  animate: (_frames, options) => { assert.equal(options.duration, 850); log.push(`animate${index}`); return { playState: 'finished', cancel() {} }; },
}));
const player = { querySelectorAll: () => parts, getBoundingClientRect: () => { log.push('root'); return rect; }, animate: () => ({ cancel() {} }) };
let signatureReads = 0;
class Node { matches() { return false; } querySelector() { return null; } }
const archive = new Node();
archive.matches = selector => selector.includes('paper-archive');
archive.getAttribute = () => layout;
const document = { body: {}, querySelector: selector => {
  signatureReads++;
  return selector === '.paper-archive' ? archive : selector === '.about-page' && about ? {} : null;
} };
load('components/use-mini-player-layout-motion.ts', { react: { useLayoutEffect: fn => { cleanup = fn(); } } }, {
  document, Element: Node, window: { addEventListener() {}, removeEventListener() {} },
  matchMedia: query => ({ matches: query.includes('min-width'), addEventListener() {}, removeEventListener() {} }),
  getComputedStyle: () => { log.push('style'); return { justifySelf: 'center' }; },
}).useMiniPlayerLayoutMotion({ current: player }, true);
const readsBefore = signatureReads;
observed.callback([{ type: 'attributes', target: new Node(), oldValue: 'waveform-bar' }]);
assert.equal(signatureReads, readsBefore, 'Ignore waveform class changes');
log.length = 0;
layout = 'tracks';
observed.callback([{ type: 'attributes', target: archive, oldValue: '' }]);
assert.equal(log.filter(item => item === 'style').length, 3);
assert.ok(log.lastIndexOf('style') < log.findIndex(item => item.startsWith('animate')), 'Batch all reads before writes');
about = true;
observed.callback([{ type: 'childList', addedNodes: [archive], removedNodes: [] }]);
assert.equal(log.filter(item => item.startsWith('animate')).length, 6, 'About transitions still animate');
cleanup();
const archiveSource = fs.readFileSync(path.join(root, 'components/paper-archive.tsx'), 'utf8');
assert.match(archiveSource, /\[measureMobileCards, measuredCardKey, listSize\]/);
assert.match(archiveSource, /\[viewport, hasPlayerTrack, geometryLayout\]/);
console.log('PASS: resize coalescing, unchanged styles skipped, observer sizes reused, stable card dependencies, read-before-write animations, waveform mutations ignored and About motion preserved');
