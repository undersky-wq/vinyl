const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),ts=require('typescript');
const exportsObject={};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/lib/shelf-shake.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:exportsObject,Math,Number});
const {ShelfShakeDetector,motionAcceleration}=exportsObject;

function trace(hz,seconds,values,sensitivity=50){
  const detector=new ShelfShakeDetector(sensitivity),events=[];
  for(let i=0;i<hz*seconds;i++){const time=i/hz;if(detector.sample(...values(time),time*1000))events.push(time);}
  return events;
}
const firstTriggers=[];
for(const hz of [20,30,60,100,200])for(const axis of [0,1,2]){
  const events=trace(hz,2,t=>{const a=[0,0,9.8];if(t>=.4)a[axis]+=8*Math.sin((t-.4)*Math.PI*6);return a;});
  assert.equal(events.length,1,`${hz}Hz axis ${axis}: ordinary back-and-forth movement triggers once`);
  firstTriggers.push(events[0]);
  assert.equal(trace(hz,5,()=>[0,0,9.8]).length,0,'Resting phone never triggers');
  assert.equal(trace(hz,5,t=>[1.5*Math.sin(t*12),.8*Math.cos(t*12),9.8+1.5*Math.sin(t*12)]).length,0,'Small walking/hand movements do not shuffle');
  assert.equal(trace(hz,5,t=>[9.8*Math.sin(t*.6),0,9.8*Math.cos(t*.6)]).length,0,'Slow orientation changes do not shuffle');
  assert.equal(trace(hz,2,t=>[t>.4&&t<.55?12:0,0,9.8]).length,0,'A single bump is insufficient');
  assert.equal(trace(hz,2,t=>[t>.4?12:0,0,9.8]).length,0,'Sustained acceleration is one peak, not repeated shakes');
}
assert(Math.max(...firstTriggers)-Math.min(...firstTriggers)<.1,'Recognition timing stays consistent across sensor frequencies');
const repeated=trace(100,8,t=>[t<.4?0:8*Math.sin((t-.4)*Math.PI*6),0,9.8]);
assert(repeated.length>=2);
assert(repeated.slice(1).every((t,i)=>t-repeated[i]>=3),'Cooldown limits repeated shuffles');
const gap=new ShelfShakeDetector();
gap.sample(0,0,9.8,0);gap.sample(20,0,9.8,200);
assert.equal(gap.sample(-20,0,9.8,5000),false,'Resume after a long pause establishes a new baseline');
assert.equal(gap.sample(NaN,0,9.8,5100),false);
assert.deepEqual(Array.from(motionAcceleration({accelerationIncludingGravity:{x:1,y:2,z:9.8},acceleration:null})),[1,2,9.8]);
assert.deepEqual(Array.from(motionAcceleration({accelerationIncludingGravity:{x:null,y:null,z:null},acceleration:{x:1,y:2,z:3}})),[1,2,3]);
assert.equal(motionAcceleration({accelerationIncludingGravity:null,acceleration:null}),null);
const gentle=t=>[t<.4?0:5*Math.sin((t-.4)*Math.PI*6),0,9.8];
assert.equal(trace(60,2,gentle,0).length,0,'Low sensitivity requires a stronger shake');
assert.equal(trace(60,2,gentle,50).length,0,'50% preserves the current force threshold');
assert.equal(trace(60,2,gentle,100).length,1,'High sensitivity detects a lighter shake');
assert.equal(trace(60,2,t=>[t<.4?0:14*Math.sin((t-.4)*Math.PI*6),0,9.8],0).length,1,'Strong shakes still work at the lowest sensitivity');
console.log('PASS: shake traces at 20–200Hz on all axes, cooldown, single-bump/slow-motion rejection, resume and nullable sensor fallback');
