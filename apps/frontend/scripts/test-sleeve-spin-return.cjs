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

for(const [a,b,c,d,expectedScale] of [[.76,.43,0,1,1.43],[1,0,0,1,1],[1.035,0,0,1.035,1.035]]){
  const properties=new Map();
  const record={offsetWidth:180,offsetHeight:180,style:{setProperty:(key,value)=>properties.set(key,value)},classList:{add:()=>{}}};
  const sleeve={squared:false,button:{parentElement:record}};
  class Matrix{constructor(){Object.assign(this,{a,b,c,d});}}
  class Point{constructor(x,y){this.x=x;this.y=y;}matrixTransform(matrix){return {x:matrix.a*this.x+matrix.c*this.y+13,y:matrix.b*this.x+matrix.d*this.y-8,w:1};}}
  const context=vm.createContext({getComputedStyle:()=>({transform:'matrix',transformOrigin:'20px 70px'}),DOMMatrix:Matrix,DOMPoint:Point});
  vm.runInContext(ts.transpileModule(functions.get('square'),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
  context.square(sleeve);
  const scale=Number(properties.get('--sleeve-grab-scale'));
  assert(Math.abs(scale-expectedScale)<1e-9,'Retain the longest projected sleeve extent without enlarging neutral Grid covers');
  const oldCenterX=20+a*(90-20)+c*(90-70)+13,oldCenterY=70+b*(90-20)+d*(90-70)-8;
  assert(Math.abs(Number.parseFloat(properties.get('--sleeve-grab-x'))+90*scale-oldCenterX)<1e-9);
  assert(Math.abs(Number.parseFloat(properties.get('--sleeve-grab-y'))+90*scale-oldCenterY)<1e-9,'Scaling preserves the visible center');
}
console.log('PASS: Shelf grab preserves projected size and center; neutral Grid size is unchanged');
