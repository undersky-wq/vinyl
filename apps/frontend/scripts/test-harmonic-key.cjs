const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');
const filename=path.resolve(__dirname,'../src/lib/harmonic-key.ts'),m=new Module(filename,module);m.filename=filename;m.paths=module.paths;m._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,filename);
const {parseHarmonicKey:get,cycleTrackSort:cycle,sortByTrackMetadata:sort}=m.exports;
for(const [a,b]of [['Ebm','D#m'],['Dbm','C#m'],['Gb','F#'],['Ab','G#'],['Bb','A#'],['Am','1m'],['C','1d'],['Am','8A'],['C','8B'],['G#m','1A']])assert.deepEqual(get(a),get(b),`${a} equals ${b}`);
assert.equal(get('not-a-key'),null);assert.equal(get(null),null);assert.equal(get(' Am ').order,0);
function lum(hex){const c=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4);return c.reduce((s,n,i)=>s+n*[.2126,.7152,.0722][i],0);}
for(let i=1;i<=12;i++)for(const mode of ['m','d']){const color=get(`${i}${mode}`);assert(1.05/(lum(color.light)+.05)>=4.5);assert((lum(color.dark)+.05)/(.006+.05)>4.5);}
const rows=[{id:'unknown',key:null,bpm:null},{id:'c',key:'C',bpm:120},{id:'am',key:'Am',bpm:100},{id:'alias1',key:'Ebm',bpm:120},{id:'alias2',key:'D#m',bpm:130}];const original=JSON.stringify(rows);
assert.deepEqual(sort(rows,{field:'bpm',direction:'asc'},r=>r).map(r=>r.id),['am','c','alias1','alias2','unknown']);
assert.deepEqual(sort(rows,{field:'bpm',direction:'desc'},r=>r).map(r=>r.id),['alias2','c','alias1','am','unknown']);
assert.deepEqual(sort(rows,{field:'key',direction:'asc'},r=>r).map(r=>r.id),['am','c','alias1','alias2','unknown']);
assert.deepEqual(sort(rows,null,r=>r),rows);assert.equal(JSON.stringify(rows),original);
let state=null;for(const direction of ['desc','asc',null]){state=cycle(state,'key');assert.equal(state?.direction||null,direction);}
const filter=m.exports.filterByHarmonicKeys;
assert.deepEqual(filter(rows,[get('Ebm').order],r=>r.key).map(r=>r.id),['alias1','alias2']);
assert.deepEqual(filter(rows,[get('Am').order,get('Ebm').order],r=>r.key).map(r=>r.id),['am','alias1','alias2']);
assert.deepEqual(filter(rows,[],r=>r.key),rows);
assert.equal(JSON.stringify(rows),original);
console.log('PASS: 24-key palette, enharmonic/Open Key/Camelot equivalence, light/dark contrast, stable sorting, unknowns last, immutable manual order and 3-state controls');
