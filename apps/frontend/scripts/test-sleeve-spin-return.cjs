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
    visible, squared: true, floatBlend: 1, x: 0, y: 0, hoverX: 0, hoverY: 0,
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

for(const [a,b,c,d,expectedScale] of [[.76,.43,0,1,1.095],[1,0,0,1,1],[1.035,0,0,1.035,1.035],[1,1.2,0,1,1.1]]){
  const properties=new Map();
  const record={offsetWidth:180,offsetHeight:180,style:{setProperty:(key,value)=>properties.set(key,value)},classList:{add:()=>{}}};
  const sleeve={squared:false,button:{parentElement:record}};
  class Matrix{constructor(){Object.assign(this,{a,b,c,d});}}
  class Point{constructor(x,y){this.x=x;this.y=y;}matrixTransform(matrix){return {x:matrix.a*this.x+matrix.c*this.y+13,y:matrix.b*this.x+matrix.d*this.y-8,w:1};}}
  const context=vm.createContext({getComputedStyle:()=>({transform:'matrix',transformOrigin:'20px 70px'}),DOMMatrix:Matrix,DOMPoint:Point});
  vm.runInContext(ts.transpileModule(functions.get('square'),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
  context.square(sleeve);
  const scale=Number(properties.get('--sleeve-grab-scale'));
  assert(Math.abs(scale-expectedScale)<1e-9,'Use average projected size with a 10% cap, without enlarging neutral Grid covers');
  const oldCenterX=20+a*(90-20)+c*(90-70)+13,oldCenterY=70+b*(90-20)+d*(90-70)-8;
  assert.equal(properties.get('--sleeve-grab-origin'),'20px 70px','The first frame keeps the original transform origin');
  assert(Math.abs(Number.parseFloat(properties.get('--sleeve-grab-x'))+20+(90-20)*scale-oldCenterX)<1e-9);
  assert(Math.abs(Number.parseFloat(properties.get('--sleeve-grab-y'))+70+(90-70)*scale-oldCenterY)<1e-9,'Scaling preserves the visible center');
}
console.log('PASS: Shelf grab uses bounded size compensation and retains its center; neutral Grid size is unchanged');

// A coalesced first pointer movement must queue an angle, not teleport the
// rendered sleeve to the full angle before the next animation frame.
{
  const sleeve={button:{},surface:{style:{}},visible:true,squared:false,floatBlend:1,phase:0,x:0,y:0,hoverX:0,hoverY:0,spinX:0,spinY:0,velocityX:0,velocityY:0,released:0};
  const grip={sleeve,pointer:1,startX:0,startY:0,lastX:0,lastY:0,lastTime:1000,pitch:0,yaw:0,targetPitch:0,targetYaw:0,moved:false};
  const context=vm.createContext({
    grip,sleeves:new Map([['cover',sleeve]]),hovered:null,root:{dataset:{layout:'grid'},classList:{contains:()=>false}},
    frame:0,previous:0,clock:0,waveMix:0,document:{hidden:false},reduced:{matches:false},settingsRef:{current:{waveEnabled:false}},
    turn:n=>((n+180)%360+360)%360-180,clamp:(n,a,b)=>Math.max(a,Math.min(b,n)),
    square:s=>{s.squared=true;},requestAnimationFrame:()=>1,
  });
  vm.runInContext(ts.transpileModule(['move','draw','wake','unsquare'].map(name=>functions.get(name)).join('\n'),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
  context.move({pointerType:'mouse',pointerId:1,clientX:80,clientY:60,timeStamp:1016,preventDefault(){},stopImmediatePropagation(){}});
  assert.equal(sleeve.spinX,0);assert.equal(sleeve.spinY,0,'First pointer packet cannot jump the rendered angle');
  assert.equal(grip.targetPitch,-42);assert.equal(grip.targetYaw,68);
  context.draw(1000);
  assert(sleeve.spinY>0&&sleeve.spinY<68&&sleeve.spinX<0&&sleeve.spinX>-42,'Rotation begins gradually during the same transition');
  assert(sleeve.floatBlend>0&&sleeve.floatBlend<1,'Floating offset fades out instead of snapping on grab');
  for(let i=1;i<=24;i++)context.draw(1000+i*1000/60);
  assert(Math.abs(sleeve.spinY-68)<1&&Math.abs(sleeve.spinX+42)<1,'The sleeve still follows the mouse promptly');
}
console.log('PASS: first pointer movement and floating offset blend into rotation without an angle jump');

// A freshly expanded fixed-position Grid cover can be observer-clipped while
// the pointer is already over it. Hover must work without first dragging it.
{
  const sleeve={button:{getBoundingClientRect:()=>({left:100,top:100,width:300,height:300})},surface:{style:{}},visible:false,squared:false,floatBlend:1,phase:0,x:0,y:0,hoverX:0,hoverY:0,spinX:0,spinY:0,velocityX:0,velocityY:0,released:0};
  const frames=new Map();let nextId=0;
  const context=vm.createContext({
    grip:null,sleeves:new Map([['cover',sleeve]]),hovered:null,root:{dataset:{layout:'grid'},classList:{contains:()=>false}},
    frame:0,previous:0,clock:0,waveMix:0,document:{hidden:false},reduced:{matches:false},settingsRef:{current:{waveEnabled:false}},
    turn:n=>((n+180)%360+360)%360-180,clamp:(n,a,b)=>Math.max(a,Math.min(b,n)),find:()=>sleeve,
    requestAnimationFrame:callback=>{frames.set(++nextId,callback);return nextId;},
  });
  vm.runInContext(ts.transpileModule(['move','draw','wake','leave','unsquare'].map(name=>functions.get(name)).join('\n'),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
  context.move({pointerType:'mouse',clientX:370,clientY:130});
  const first=[...frames.values()];frames.clear();first.forEach(callback=>callback(1000));
  assert(sleeve.x>0&&sleeve.y<0,'An observer-clipped expanded cover responds to the first hover');
  assert(sleeve.surface.style.transform.includes('rotateY('));
  assert.equal(sleeve.squared,false,'Hover does not require a grab or square transition');
  context.leave();
  for(let now=1017;now<6000&&frames.size;now+=1000/60){const current=[...frames.values()];frames.clear();current.forEach(callback=>callback(now));}
  assert.equal(sleeve.x,0);assert.equal(sleeve.y,0);
  assert.equal(frames.size,0,'Leaving the expanded cover stops the idle animation loop');
}
console.log('PASS: newly expanded observer-clipped Grid covers react to hover before any drag');
