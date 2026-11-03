const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const vm = require('node:vm');
const exportsObject = {};
const source = fs.readFileSync(path.join(__dirname, '../src/lib/player-storage.ts'), 'utf8');
const compiled = ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
vm.runInNewContext(compiled, {exports:exportsObject});
const {PLAYER_STATE_KEY, preparePlayerState, writePlayerState, readPlayerState} = exportsObject;
const waveform = Array(8192).fill(.673);
const tracks = Array.from({length:2400},(_,i)=>({
  id:`track-${i}`,title:`Song ${i}`,artist:'Artist',releaseId:`release-${Math.floor(i/6)}`,
  audioUrl:`https://audio.example/track-${i}?signature=${'a'.repeat(200)}`,
  coverUrl:`https://cover.example/release-${Math.floor(i/6)}`,
  coverFullUrl:`https://cover.example/release-${Math.floor(i/6)}`,
  waveformData:waveform, playbackSource:{section:'collection',href:'/?layout=tracks'},
}));
const snapshot = {queue:tracks,displayQueue:tracks.slice(798,804),currentIndex:800,currentTrack:tracks[800],volume:.35,isShuffleEnabled:true,isRepeatEnabled:true};
const prepared = preparePlayerState(snapshot);
assert(prepared.primary.length < 2_000_000);
assert(!prepared.primary.includes('waveformData'));
const packed = JSON.parse(prepared.primary);
assert.equal(packed.tracks.length,2400);
assert.equal(packed.assets.length,2800,'repeated artwork URLs are shared rather than copied');
const values = new Map([['unrelated','keep']]);
const storage = {getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)};
assert(writePlayerState(()=>storage,prepared,234.7));
const restored = readPlayerState(()=>storage);
assert.equal(restored.queue.length,2400);
assert.equal(restored.currentTrack.id,'track-800');
assert.equal(restored.currentIndex,800);
assert.equal(restored.currentTime,234);
assert.equal(restored.volume,.35);
assert.equal(restored.isShuffleEnabled,true);
assert.equal(restored.isRepeatEnabled,true);
assert.equal(restored.currentTrack.waveformData,undefined);
assert.equal(restored.queue[800].audioUrl,tracks[800].audioUrl);
assert.equal(restored.displayQueue.length,6);
assert.equal(tracks[800].waveformData.length,8192,'live queue retains its waveform and is never mutated');
assert.equal(values.get('unrelated'),'keep');
const oldPacked=JSON.parse(prepared.primary);
oldPacked.tracks.forEach(track=>{track.urls=track.urls.slice(0,7);});
values.set(PLAYER_STATE_KEY,JSON.stringify(oldPacked));
assert.equal(readPlayerState(()=>storage).queue.length,2400,'existing seven-URL snapshots remain readable');
const artworkTrack={...tracks[800],backCoverMobileUrl:'/b-small',backCoverMediumUrl:'/b-medium'};
assert(writePlayerState(()=>storage,preparePlayerState({queue:[artworkTrack],currentIndex:0,currentTrack:artworkTrack}),0));
assert.equal(readPlayerState(()=>storage).currentTrack.backCoverMobileUrl,'/b-small');
assert.equal(readPlayerState(()=>storage).currentTrack.backCoverMediumUrl,'/b-medium');
const anchored = preparePlayerState({...snapshot,queue:snapshot.queue.map(track=>track.id===snapshot.currentTrack.id?{...track,queueAnchorOnly:true}:track)});
assert(writePlayerState(()=>storage,anchored,234));
assert.equal(readPlayerState(()=>storage).queue[800].queueAnchorOnly,true,'an excluded playing track must remain excluded from shuffle candidates after restore');
let attempts=0;
const fullStorage = {getItem:storage.getItem,setItem:()=>{attempts++;throw Object.assign(Error('full'),{name:'QuotaExceededError'});}};
assert.doesNotThrow(()=>assert.equal(writePlayerState(()=>fullStorage,prepared,10),false));
assert.equal(attempts,2,'bounded fallback, no retry loop');
assert.equal(writePlayerState(()=>{throw Error('SecurityError');},prepared,10),false);
assert.equal(readPlayerState(()=>{throw Error('SecurityError');}),null);
const smallStorage = {getItem:storage.getItem,setItem:(key,value)=>{if(value.length>10_000)throw Error('quota');storage.setItem(key,value);}};
assert(writePlayerState(()=>smallStorage,prepared,55));
assert.equal(readPlayerState(()=>storage).queue.length,1,'limited storage only reduces the restored snapshot, not the playing queue');
assert.equal(tracks.length,2400);
values.set(PLAYER_STATE_KEY,JSON.stringify({...snapshot,queue:[tracks[800]],displayQueue:[tracks[800]],currentIndex:0,currentTime:88}));
assert.equal(readPlayerState(()=>storage).currentTrack.id,'track-800','legacy state is still readable');
assert.equal(readPlayerState(()=>storage).currentTrack.waveformData,undefined);
for(const broken of ['{','null',JSON.stringify({version:2,assets:[],tracks:[],queue:[999],displayQueue:[],currentTrack:999}),JSON.stringify({queue:{bad:true},currentTrack:tracks[0]})]) {
  values.set(PLAYER_STATE_KEY,broken);
  assert.equal(readPlayerState(()=>storage),null);
}
const provider=fs.readFileSync(path.join(__dirname,'../src/providers/player-provider.tsx'),'utf8');
assert(!provider.includes('window.sessionStorage.setItem('));
assert(provider.includes('Boolean(refreshedTrack.waveformData?.length) && !trackToRefresh.waveformData?.length'));
console.log(`PASS: 2400-track queue restored from ${prepared.primary.length} characters; no saved waveforms; full/blocked storage, bounded fallback, legacy state, malformed state and unchanged live queue`);

if(process.env.PLAYER_STORAGE_BROWSER === '1') {
  (async()=>{
    const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
    const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
    try {
      const page=await browser.newPage();const errors=[];
      page.on('pageerror',error=>errors.push(error.message));
      await page.route('http://player-storage.test/**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><script>var exports={};</script><p>Player persistence check</p>'}));
      await page.goto('http://player-storage.test/');
      await page.addScriptTag({content:compiled});
      const result=await page.evaluate(prepared=>{
        const write=window.exports.writePlayerState;const read=window.exports.readPlayerState;
        const initial=write(()=>sessionStorage,prepared,123);
        const restoredCount=read(()=>sessionStorage).queue.length;
        sessionStorage.removeItem('vinyl-player-state');
        let count=0;
        try { for(;count<200;count++)sessionStorage.setItem(`test-fill-${count}`,'x'.repeat(64*1024)); } catch {}
        let threw=false;let saved;
        try { saved=write(()=>sessionStorage,prepared,456); } catch {threw=true;}
        return {initial,restoredCount,count,threw,saved};
      },prepared);
      assert(result.initial);assert.equal(result.restoredCount,2400);assert(result.count>0);assert.equal(result.threw,false);assert.deepEqual(errors,[]);
      console.log(`PASS: real Chromium storage quota filled with ${result.count} chunks, no uncaught exception`);
    } finally {await browser.close();}
  })().catch(error=>{console.error(error);process.exitCode=1;});
}
