const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');
const root=path.join(__dirname,'../src');
function load(file,mock){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:mock});return exports;}
const images=load('lib/release-images.ts',()=>({}));
const {cachedTrackArtwork,releaseArtworkSnapshot,releaseTrackArtwork}=load('lib/release-queue-artwork.ts',name=>name==='./release-images'?images:{});
const release={id:'double',coverStorageUrl:'/record-1-a',coverThumbStorageUrl:'/record-1-thumb',backCoverUrl:'/record-1-b',secondCoverUrl:'/record-2-a',secondBackCoverUrl:'/record-2-b',tracks:[{waveformData:Array(8192).fill(1)}]};
const snapshot=releaseArtworkSnapshot(release);
assert(!('tracks' in snapshot),'cache artwork only, not waveforms or audio');
const cache=new Map([['double',snapshot]]);
const source=['B1','C1','C2','D1'].map(position=>({id:position,position,releaseId:'double',title:position,audioUrl:`/audio/${position}`,coverUrl:'/record-1-a',frontCoverUrl:'/record-1-a',frontCoverFullUrl:'/record-1-a',waveformData:[.1,.9],playbackSource:{section:'collection'}}));
const ready=source.map(track=>cachedTrackArtwork(track,cache));
assert.deepEqual(ready.map(track=>track.coverUrl),['/record-1-b','/record-2-a','/record-2-a','/record-2-b']);
assert.equal(ready[1].frontCoverFullUrl,'/record-2-a','the next track already has the second vinyl before playback switches');
assert.equal(images.playingCoverImage(ready[1]).mobileSrc,'/record-2-a');
for(let i=0;i<ready.length;i++){
  assert.equal(ready[i].audioUrl,source[i].audioUrl,'never replace the audio source');
  assert.strictEqual(ready[i].waveformData,source[i].waveformData);
  assert.strictEqual(ready[i].playbackSource,source[i].playbackSource);
  assert.strictEqual(cachedTrackArtwork(ready[i],cache),ready[i],'unchanged artwork does not create another state update');
}
assert.equal(source[1].coverUrl,'/record-1-a','no mutation of the old queue');
assert.equal(releaseTrackArtwork(source[1],{...snapshot,id:'other'}),source[1]);
cache.set('double',releaseArtworkSnapshot({...release,secondCoverUrl:'/edited-2-a'}));
assert.equal(cachedTrackArtwork(source[1],cache).coverUrl,'/edited-2-a','editing C fixes all upcoming tracks without a per-track request');
const provider=fs.readFileSync(path.join(root,'providers/player-provider.tsx'),'utf8');
assert(provider.includes("window.addEventListener('vinyl:release-artwork-updated',update)"));
assert(provider.includes('sharedQueue = queueRef.current.map(normalize)'));
assert(provider.includes('cachedTrackArtwork(queuedTrack,releaseArtworkCache.current)'));
console.log('PASS: stale B-to-C queue updated before switching, independent disc artwork, editor refresh, no audio/waveform changes or repeated state updates');
