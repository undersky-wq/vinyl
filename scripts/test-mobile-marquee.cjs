// Run from the repository root: node scripts/test-mobile-marquee.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('../apps/mobile/node_modules/typescript');
const root = path.resolve(__dirname, '..');

function load(filename) {
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  const loaded = { exports: {} };
  new Function('module', 'exports', output.outputText)(loaded, loaded.exports);
  return loaded.exports;
}
const marquee = load(path.join(root, 'apps/mobile/src/lib/marquee.ts'));

assert.deepEqual(marquee.getMarqueeMotion(200, 200), { overflow: 0, shouldScroll: false, durationMs: 0 });
assert.deepEqual(marquee.getMarqueeMotion(204, 200), { overflow: 4, shouldScroll: false, durationMs: 0 });
assert.deepEqual(marquee.getMarqueeMotion(205, 200), { overflow: 5, shouldScroll: true, durationMs: 3200 });
assert.deepEqual(marquee.getMarqueeMotion(1000, 200), { overflow: 800, shouldScroll: true, durationMs: 12000 });
assert.equal(marquee.getMarqueeMotion(500, 200, true).shouldScroll, false);
for (const dimensions of [[NaN, 100], [100, Infinity], [-1, 100], [100, 0]]) {
  assert.deepEqual(marquee.getMarqueeMotion(...dimensions), { overflow: 0, shouldScroll: false, durationMs: 0 });
}

const fullPlayer = fs.readFileSync(path.join(root, 'apps/mobile/src/components/FullPlayer.tsx'), 'utf8');
for (const expected of [
  "AccessibilityInfo.isReduceMotionEnabled()",
  "AccessibilityInfo.addEventListener('reduceMotionChanged'",
  'width: 10000',
  'onLayout={(event) => setTextWidth(event.nativeEvent.layout.width)}',
  "ellipsizeMode={isMoving ? 'clip' : 'tail'}",
  'toValue: -motion.overflow',
  'active={visible}',
]) assert.ok(fullPlayer.includes(expected), expected);
assert.ok(!fullPlayer.includes('marqueeClone'));
assert.ok(!fullPlayer.includes('distance = textWidth + gap'));

console.log('PASS: overflow-only marquee, duration bounds, reduced motion, natural-width measurement, delayed motion and no clone loop.');
