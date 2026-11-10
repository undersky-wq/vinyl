const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),ts=require('typescript');
function readModule(name){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/lib',name),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports,Math,Number});return exports;}
const {shelfScrollStep}=readModule('shelf-scroll-step.ts');
const positions=[30,60,120,144].map(fps=>{let p=0;for(let i=0;i<fps;i++)p=shelfScrollStep(p,1000,1000/fps);return p;});assert.ok(positions.every(p=>Math.abs(p-positions[0])<1e-7));assert.equal(shelfScrollStep(1,100,16,true),100);assert.equal(shelfScrollStep(1,100,5000),shelfScrollStep(1,100,50));
const {shuffledShelf,ShelfShakeDetector}=readModule('shelf-shake.ts');const source=Array.from({length:86},(_,i)=>String(i)),shuffled=shuffledShelf(source,1);assert.deepEqual(Array.from(shuffled).sort(),[...source].sort());assert.notDeepEqual(Array.from(shuffled),source);
const detector=new ShelfShakeDetector();assert.equal(detector.sample(0,0,9.8,0),false);assert.equal(detector.sample(25,0,9.8,140),false);assert.equal(detector.sample(-25,0,9.8,280),true);assert.equal(detector.sample(25,0,9.8,420),false);
console.log('PASS: refresh-independent smoothing, permutation integrity and shake threshold/cooldown');
