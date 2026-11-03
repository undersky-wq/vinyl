const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');
const root=path.join(__dirname,'../src');
function load(file,mock){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:mock});return exports;}
const images=load('lib/release-images.ts',()=>({}));
let manual=null;
const {usePlayerCoverSide}=load('lib/use-player-artwork.ts',name=>name==='react'?{useState:()=>[manual,next=>{manual=next;}]}:name==='./release-images'?images:{});
for(const position of ['A1','B1','C1','D1']){
  const track={id:position,position,coverUrl:'/old',frontCoverUrl:position[0]<'C'?'/a':'/c',frontCoverMobileUrl:'/front-thumb',backCoverUrl:position[0]<'C'?'/b':'/d'};
  const back=/^[BD]/.test(position);
  const artwork=images.playingCoverImage(track);
  assert.equal(artwork.src,back?track.backCoverUrl:track.frontCoverMobileUrl);
  assert.equal(artwork.mobileSrc,back?undefined:'/front-thumb','mobile source cannot overwrite B/D with the front thumbnail');
  assert.equal(usePlayerCoverSide(track,track.backCoverUrl).isCoverFlipped,back,'correct side on the first render, before effects');
}
const b={id:'b1',position:'B1'};
usePlayerCoverSide(b,'/b').toggleCoverSide();
assert.equal(usePlayerCoverSide(b,'/b').isCoverFlipped,false,'manual B to A remains available');
assert.equal(usePlayerCoverSide({id:'d1',position:'D1'},'/d').isCoverFlipped,true,'next track follows its side rather than the previous manual override');
assert.equal(usePlayerCoverSide(b,undefined).isCoverFlipped,false,'missing reverse artwork never flips to an empty face');
for(const file of ['components/mini-player.tsx','components/player-page-client.tsx'])assert(fs.readFileSync(path.join(root,file),'utf8').includes('usePlayerCoverSide(currentTrack,backArtwork)'));
console.log('PASS: mini and full players use A/B/C/D on first render, correct mobile image, manual flip and next-track reset');
