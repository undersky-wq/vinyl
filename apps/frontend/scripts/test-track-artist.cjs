const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');
const read=file=>fs.readFileSync(path.join(__dirname,'../src',file),'utf8');
const compile=source=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const artistExports={};
vm.runInNewContext(compile(read('lib/track-artist.ts')),{exports:artistExports});
const {trackArtist}=artistExports;
assert.equal(trackArtist({artists:['Track artist']},'Various'),'Track artist');
assert.equal(trackArtist({artists:['  Artist one  ','','Artist two',' ']},'Various'),'Artist one, Artist two');
for(const artists of [undefined,null,[],['','  ']])assert.equal(trackArtist({artists},'Release artist'),'Release artist');

const api=read('lib/api.ts');
const tree=ts.createSourceFile('api.ts',api,ts.ScriptTarget.Latest,true);
const mapping=tree.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='mapHomeRelease');
const context={};
vm.createContext(context);
vm.runInContext(compile(mapping.getText(tree)),context);
const release=context.mapHomeRelease({id:'compilation',artist:'Various',styles:[],tracks:[
  {id:'b',title:'Second',artists:['Second artist'],position:'B1',audioFiles:[{storageUrl:'/b.mp3'}]},
  {id:'a',title:'First',artists:['First artist'],position:'A1',audioFiles:[{storageUrl:'/a.mp3'}]},
]});
assert.equal(release.tracks[0].id,'a');
assert.deepEqual(Array.from(release.tracks[0].artists),['First artist'],'Home mapping preserves the selected track artist after sorting');
const queueExports={};
vm.runInNewContext(compile(read('lib/music-page-queue.ts')),{exports:queueExports,require:name=>{
  assert.equal(name,'./track-artist');return artistExports;
}});
assert.equal(queueExports.musicPageQueue([release])[0].artist,'First artist');
assert.equal(queueExports.musicPageQueue([{...release,tracks:[{...release.tracks[0],artists:[]}]}])[0].artist,'Various');
for(const [file,call] of [
  ['components/paper-archive.tsx','artist: trackArtist(t, r.artist)'],
  ['components/mini-release-preview.tsx','artist:trackArtist(candidate,release.artist)'],
  ['components/shelf-mix-detail.tsx','artist:trackArtist(track,release.artist)'],
  ['components/release-card.tsx','artist: trackArtist(track, release.artist)'],
  ['components/playlist-browser.tsx','artist: trackArtist(item.track, release.artist)'],
  ['components/favorites-browser.tsx','artist: trackArtist(track, track.release.artist)'],
  ['components/tracklist-browser.tsx','artist: trackArtist(track, release.artist)'],
])assert(read(file).includes(call),`${file}: playback uses the shared artist rule`);
assert(read('components/public-music-page.tsx').includes('artists: track.artists'));
console.log('PASS: track artist precedence, multiple artists, empty fallback, API mapping, music queues and all playback entry points (fixtures; no database changes)');
