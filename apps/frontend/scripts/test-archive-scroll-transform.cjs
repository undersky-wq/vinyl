const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.join(__dirname, '../src');
const source = fs.readFileSync(path.join(root, 'lib/archive-scroll-transform.ts'), 'utf8');
const exportsObject = {};
vm.runInNewContext(ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText, {exports:exportsObject});
const {archiveScrollTransform} = exportsObject;
function check(stack, mobile, width, height, delta) {
  const value = archiveScrollTransform(140 + delta, 140, {stack,mobile,width,height});
  const [, x, y] = value.match(/translate3d\(([-.\d]+)px, ([-.\d]+)px, 0\)/);
  const legacyX = stack ? 0 : -delta;
  const legacyY = stack ? -delta * (mobile ? -4 : -1.6) : delta * (mobile ? .28 : height / width);
  assert.ok(Math.abs(Number(x) - legacyX) < 1e-9);
  assert.ok(Math.abs(Number(y) - legacyY) < 1e-9);
}
for (const [width,height] of [[320,568],[390,844],[700,900],[1280,720],[1920,1080]]) {
  for (const stack of [false,true]) for (const delta of [-10000,-128,-.1,0,.1,128,10000]) {
    check(stack,width <= 700,width,height,delta);
  }
}
const archive = fs.readFileSync(path.join(root, 'components/paper-archive.tsx'), 'utf8');
const ast = ts.createSourceFile('archive.tsx',archive,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let snippet;
function visit(node) {
  if (ts.isFunctionDeclaration(node) && node.name?.text === 'drawCompositedTravel') snippet = node.getText(ast);
  ts.forEachChild(node,visit);
}
visit(ast);
assert.ok(snippet);
let writes = 0;
const context = {
  compositorScroll:true,transport:{current:{style:{set transform(value){writes++;this.value=value;}}}},
  selected:null,gridMix:0,stackTransitioning:false,autoLayout:false,middleDrag:{current:null},
  stackMode:true,viewport:{width:390,height:844},transportOrigin:{current:140},archiveScrollTransform,
};
vm.createContext(context);
vm.runInContext(ts.transpileModule(snippet,{}).outputText,context);
for(let i=0;i<120;i++) assert.equal(context.drawCompositedTravel(140+i),true);
assert.equal(writes,120);
assert.equal(context.transportOrigin.current,140,'Do not rebase geometry on every frame');
assert(!/setProperty|offsetHeight|clientHeight|clientWidth|getComputedStyle|getBoundingClientRect/.test(snippet));
for(const [key,value] of [['compositorScroll',false],['selected',2],['gridMix',1],['stackTransitioning',true],['autoLayout',true]]) {
  const previous=context[key];context[key]=value;
  assert.equal(context.drawCompositedTravel(999),false);
  context[key]=previous;
}
assert.equal(writes,120,'Legacy, expanded, grid and layout transitions keep their existing path');
assert(archive.includes('const compositorScroll = true;'));
assert(!archive.includes("routeParams.get('motion')"),'New motion is enabled without a URL switch');
assert.match(archive, /if \(compositorScroll\) \{[\s\S]*?settleShelfMotion\(\);[\s\S]*?captureCoverTransition\(true\)/);
console.log('PASS: original Shelf/Stack trajectories on five viewports, 120 transform-only frames, no layout reads or coordinate writes, guarded legacy/expanded/morph paths');
