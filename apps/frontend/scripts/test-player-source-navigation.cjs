const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');
function load(file){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/lib',file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports,URL,URLSearchParams});return exports;}
const {playerSourceNavigation:nav,playerSourceTrack}=load('player-source-navigation.ts');
const {liveCollectionQueue}=load('collection-playback-queue.ts');
const track={id:'track-b2',releaseId:'release-2',audioUrl:'/audio',playbackSource:{section:'collection',href:'/?layout=shelf&search=deep#styles=House%2CTechno'}};
let result=nav(track,'ru');
assert.equal(result.label,'Коллекция: House + Techno; Поиск: deep');
let url=new URL(result.href,'https://test.local');
assert.equal(url.pathname,'/');assert.equal(url.searchParams.get('layout'),'tracks');
assert.equal(url.searchParams.get('focusTrack'),track.id);assert.equal(url.searchParams.get('focusRelease'),track.releaseId);
assert.equal(new URLSearchParams(url.hash.slice(1)).get('styles'),'House,Techno');
for(const [section,pathname] of [['playlists','/'],['mixes','/mixes'],['originals','/tracks'],['favorites','/favorites']]){
 result=nav({...track,playbackSource:{section,name:'Road music',href:'/?playlist=list-1'}},'en');url=new URL(result.href,'https://test.local');
 assert.equal(url.pathname,pathname);assert.equal(url.searchParams.get('layout'),'tracks');assert.equal(url.searchParams.get('focusTrack'),track.id);
 if(section==='playlists'){assert.equal(result.label,'Playlists: Road music');assert.equal(url.searchParams.get('playlist'),'list-1');}
}
const updated=liveCollectionQueue([track],[track.releaseId],track,'/#styles=Disco');
assert.equal(nav(updated[0],'en').label,'Collection: Disco');
assert.equal(nav(playerSourceTrack(track,updated),'ru').label,'Коллекция: House + Techno; Поиск: deep','active tooltip preserves the filters used at playback start');
assert.equal(new URL(nav(playerSourceTrack(track,updated),'ru').href,'https://test.local').searchParams.get('search'),'deep');
assert.equal(nav(playerSourceTrack(updated[0],updated),'en').label,'Collection: Disco','the next launched track receives its own filter snapshot');
const excluded=liveCollectionQueue([],[],track,'/');
assert.equal(nav(excluded[0],'ru').label,'Коллекция: Все жанры');
assert(excluded[0].queueAnchorOnly);
assert.equal(nav(playerSourceTrack(track,excluded),'ru').label,'Коллекция: House + Techno; Поиск: deep','excluding the playing track does not overwrite its launch context');
assert.equal(nav({...track,playbackSource:undefined,isOriginal:true},'ru').label,'Треки');
console.log('PASS: collection live filters/search, playlist identity, all five source routes, Tracks mode, exact track/release targeting, excluded-track anchor and old metadata fallback');
