const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../src/components/use-shelf-motion-preview.ts'), 'utf8');
const ast = ts.createSourceFile('motion.ts', source, ts.ScriptTarget.Latest, true);
const functions = new Map();
function collect(node) {
  if (ts.isFunctionDeclaration(node) && node.name) functions.set(node.name.text, node.getText(ast));
  ts.forEachChild(node, collect);
}
collect(ast);

for (const layout of ['grid', 'tracks', 'shelf', 'stack']) for (const visible of [false, true]) for (const reduce of [false, true]) {
  let nextId = 0, returned = 0;
  const frames = new Map();
  const record = { classList: { remove(name) { assert.equal(name, 'is-sleeve-squared'); returned++; } } };
  const sleeve = { button: { parentElement: record }, surface: { style: {} }, phase: 0,
    visible, squared: true, x: 0, y: 0, hoverX: 0, hoverY: 0,
    spinX: -38, spinY: 136, velocityX: -3, velocityY: 5, released: 1000 };
  const context = vm.createContext({
    document: { hidden: false }, root: { dataset: { layout }, classList: { contains: () => false } },
    settingsRef: { current: { waveEnabled: false } }, reduced: { matches: reduce },
    sleeves: new Map([['cover', sleeve]]), grip: null, hovered: null,
    frame: 0, previous: 0, clock: 0, waveMix: 0,
    turn: n => ((n + 180) % 360 + 360) % 360 - 180,
    requestAnimationFrame(callback) { frames.set(++nextId, callback); return nextId; },
  });
  vm.runInContext(ts.transpileModule(['wake', 'draw', 'unsquare'].map(name => functions.get(name)).join('\n'), {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText, context);
  context.wake();
  for (let now = 1000; now < 6000 && frames.size; now += 1000 / 60) {
    const current = [...frames.values()]; frames.clear(); current.forEach(callback => callback(now));
  }
  assert.equal(sleeve.squared, false, `${layout}, visible=${visible}, reduced=${reduce}: released cover must return even when its fixed-position button is outside the observer root`);
  assert.equal(returned, 1, 'Restore the original layout transform exactly once');
  assert.equal(Math.abs(context.turn(sleeve.spinX)) + Math.abs(context.turn(sleeve.spinY)), 0, 'Finish at the original orientation');
  assert.equal(frames.size, 0, 'Stop the idle frame loop once the cover has returned');
}
console.log('PASS: released 3D covers return in all layouts, visible or observer-clipped, with and without reduced motion');
