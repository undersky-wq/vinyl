const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const path = require('node:path');
const exportsObject = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/lib/square-cover.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: exportsObject });
const crop = exportsObject.squareCoverBounds;
assert.equal(crop(1200, 800, 50, 50, 1).side, 800);
assert.equal(crop(1200, 800, 50, 50, 1).x, 200);
assert.equal(crop(800, 1200, 50, 100, 1).y, 400);
assert.equal(crop(800, 1200, 50, 50, 2).side, 400);
for (const [width, height] of [[1200,800], [800,1200], [100,100]]) for (const zoom of [1,2,3]) for (const value of [-100,0,50,100,200]) {
  const bounds = crop(width,height,value,value,zoom);
  assert(bounds.x >= 0 && bounds.y >= 0);
  assert(bounds.x + bounds.side <= width && bounds.y + bounds.side <= height);
}
console.log('PASS: square crops preserve aspect ratio, zoom and stay within landscape/portrait/square sources');
