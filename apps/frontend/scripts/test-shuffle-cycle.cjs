const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');
const exportsObject={};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/lib/shuffle-cycle.ts'),'utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS},
}).outputText,{exports:exportsObject});
const cycle=exportsObject.createShuffleCycle(()=>0);
const tracks=['a','b','c','d'].map(id=>({id}));
let current=0;
const heard=['a'];
for(let i=0;i<3;i++){current=cycle.next(tracks,current);heard.push(tracks[current].id);}
assert.equal(new Set(heard).size,4);
assert.notEqual(cycle.next(tracks,current),current);
cycle.reset();
assert.equal(cycle.next(tracks,0),1);
// New genres add eligible tracks without replaying already heard IDs.
assert.equal(cycle.next([{id:'b'},{id:'c'},{id:'new'}],0),1);
assert.equal(cycle.next([{id:'c'},{id:'new'}],0),1);
assert.equal(cycle.next([{id:'only'}],0),0);
console.log('PASS: shuffle cycle avoids repeats, handles changing filters and single tracks');
