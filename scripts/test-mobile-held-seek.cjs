const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('../apps/mobile/node_modules/typescript');

const filename = path.resolve(__dirname, '../apps/mobile/src/lib/held-seek.ts');
const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const loaded = { exports: {} };
new Function('module', 'exports', code)(loaded, loaded.exports);
const { getHeldSeekPosition, HELD_SEEK_STEP_MS, HELD_SEEK_INTERVAL_MS } = loaded.exports;

assert.equal(HELD_SEEK_STEP_MS, 5000);
assert.equal(HELD_SEEK_INTERVAL_MS, 320);
assert.equal(getHeldSeekPosition(10_000, 60_000, 1), 15_000);
assert.equal(getHeldSeekPosition(10_000, 60_000, -1), 5_000);
assert.equal(getHeldSeekPosition(58_000, 60_000, 1), 60_000, 'forward seek must stop at duration');
assert.equal(getHeldSeekPosition(2_000, 60_000, -1), 0, 'rewind must stop at zero');
assert.equal(getHeldSeekPosition(Number.NaN, 60_000, 1), 5_000);
assert.equal(getHeldSeekPosition(10_000, 0, 1), 0);

console.log('PASS: held previous/next seek steps and boundary clamping.');
