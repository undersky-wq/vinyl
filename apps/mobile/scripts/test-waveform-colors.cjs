const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
const vm=require('node:vm');
const moduleExports={};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/lib/archive-section-colors.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:moduleExports});
const color=moduleExports.archiveWaveformColor;
for(const dark of [false,true]){
  assert.equal(color('home','fallback',dark),'#3478db');
  assert.equal(color('playlists','fallback',dark),'#27874d');
  assert.equal(color('mixes','fallback',dark),'#8950c8');
  assert.equal(color('favorites','fallback',dark),'#db3045');
}
assert.equal(color('originals','fallback',false),'#b77713');
assert.equal(color('originals','fallback',true),'#e5ab4c');
console.log('PASS: all waveform source colors and light/dark original-track colors');
