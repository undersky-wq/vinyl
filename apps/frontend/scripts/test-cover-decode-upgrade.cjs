const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../src/components/paper-archive.tsx'), 'utf8');
const ast = ts.createSourceFile('archive.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const hook = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'useDecodedCover');
assert(hook);
let value = null, previousDeps, cleanup;
const pending = [];
const context = {
  useState: () => [value, next => { value = next; }],
  useEffect(effect, deps) {
    if (previousDeps && deps.every((value, index) => Object.is(value, previousDeps[index]))) return;
    cleanup?.(); previousDeps = deps; cleanup = effect();
  },
  decodeCover(url) { return new Promise(resolve => pending.push({url, resolve})); },
};
vm.createContext(context);
vm.runInContext(ts.transpileModule(hook.getText(ast), {}).outputText, context);
async function resolve(index, ready) { pending[index].resolve(ready); await Promise.resolve(); }
(async () => {
  assert.equal(context.useDecodedCover('front-medium', false), false);
  assert.equal(pending.length, 0, 'Shelf does not download an unnecessary upgrade');
  assert.equal(context.useDecodedCover('front-medium', true), false, 'Stack keeps the thumbnail while decoding');
  assert.equal(context.useDecodedCover('front-medium', true), false);
  assert.equal(pending.length, 1);
  await resolve(0, true);
  assert.equal(context.useDecodedCover('front-medium', true), true);
  assert.equal(context.useDecodedCover('front-medium', false), true, 'Returning to Shelf keeps the decoded rendition');
  assert.equal(context.useDecodedCover('back-medium', true), false, 'A new side cannot reuse the front readiness');
  await resolve(1, false);
  assert.equal(context.useDecodedCover('back-medium', true), false, 'A failed upgrade never replaces the thumbnail');
  assert.equal(context.useDecodedCover('disc-two-medium', true), false);
  assert.equal(context.useDecodedCover('disc-three-medium', true), false);
  await resolve(2, true);
  assert.equal(context.useDecodedCover('disc-three-medium', true), false, 'Stale decoded disc cannot replace the current cover');
  await resolve(3, true);
  assert.equal(context.useDecodedCover('disc-three-medium', true), true);
  assert(source.includes('const prepareMedium = !deckPreview && useMedium && !originalPreview && !desktopViewport && (eager || selected)'));
  assert(source.includes('useDecodedCover(medium, prepareMedium && !flipped'));
  assert(source.includes('useDecodedCover(backMedium, prepareMedium && flipped'));
  assert(source.includes('!deckPreview && frontReady && medium !== thumb && <source media="(max-width:700px)"'));
  assert(source.includes('!deckPreview && backReady && backMedium !== backThumb && <source media="(max-width:700px)"'));
  assert(source.includes('deckPreview && <source media="(max-width:700px)" srcSet={medium} />'));
  assert(source.includes('deckPreview && <source media="(max-width:700px)" srcSet={backMedium} />'));
  assert(source.includes('deckPreview={gridMix < .01 && listMix < .01}'), 'Both decks use medium sources from their first render');
  assert(source.includes('<source media="(min-width:701px)" srcSet={full} />'), 'Desktop still selects originals');
  const coverSources = fs.readFileSync(path.join(__dirname, '../src/lib/cover-sources.ts'), 'utf8');
  const exports = {};
  vm.runInNewContext(ts.transpileModule(coverSources, {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText, {exports});
  for (const [width, height] of [[320,568],[390,844],[430,932],[700,500]]) {
    const size = exports.mobileDeckCoverSize(width, height);
    for (const dpr of [1,2,3]) assert.equal(size*dpr > 320, Math.max(180,Math.min(width*.62,height*.32))*dpr > 320);
  }
  assert(source.includes('viewport.width<=700 && gridMix < .01 && listMix < .01 ? mobileDeckCoverSize(viewport.width,viewport.height)'));
  assert(source.includes('compactPreview={viewport.width>700 && !stackMode'));
  console.log('PASS: thumbnail retained during decode; no downgrade, failed/stale swaps, inactive-side preload or desktop changes');
})().catch(error => { console.error(error); process.exitCode = 1; });
