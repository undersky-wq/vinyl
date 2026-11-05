const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../src/components/paper-archive.tsx'), 'utf8');
const ast = ts.createSourceFile('archive.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let initializer;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'trackVisibleIndices') initializer = node.initializer.getText(ast);
  ts.forEachChild(node, visit);
}
visit(ast);
assert(initializer);
const visibleIndices = Array.from({length: 63}, (_, i) => i);
const rawVisibleIndices = [23, 24, 25, 26, 27];
for (const listMix of [0, .2, .85, .99, 1]) {
  const context = {listMix, visibleIndices, rawVisibleIndices};
  const indices = vm.runInNewContext(initializer, context);
  assert.equal(indices, listMix >= 1 ? rawVisibleIndices : visibleIndices);
}
assert.equal(visibleIndices.length, 63, 'Cover morph window is unchanged');
assert(source.includes('const measuredCardKey = trackVisibleIndices.map('));
assert(source.includes('listMix > .85 ? trackVisibleIndices.map('));
assert(source.includes('{listMix > 0 && trackVisibleIndices.map('));
assert(source.includes('ref={transport}>{visibleIndices.map('));
assert(source.includes('article.animate(['), 'Keep the text reveal animation');
console.log('PASS: full Tracks mounts/measures/fetches only its visible window; outgoing cover motion and text reveal retained');
