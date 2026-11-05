const assert=require('node:assert/strict');
require('ts-node').register({transpileOnly:true});
const {AppController}=require('../src/modules/app.controller.ts');
(async()=>{
 const images=[{id:'front',type:'COVER',storageKey:'front.jpg',url:'/front'},
  {id:'back',isBackCover:true,storageKey:'back.jpg',thumbStorageKey:'back-small.webp',url:'/back'},
  {id:'disc2',isSecondFrontCover:true,storageKey:'disc2.jpg',url:'/disc2'},
  {id:'disc2back',isSecondBackCover:true,storageKey:'disc2back.jpg',url:'/disc2back'}];
 const release={id:'release',artist:'Artist',title:'Album',styles:['House'],coverStorageKey:'front.jpg',coverThumbStorageKey:'thumb.webp',coverMediumStorageKey:'medium.webp',images};
 const original=['B1','D1'].map((position,i)=>({id:`track-${i}`,position,title:`Favorite ${i}`,waveformData:[.1,.4,.2],audioFiles:[{id:`audio-${i}`,storageKey:`${i}.mp3`,normalizedStorageKey:`normalized-${i}.mp3`}],release}));
 let query;
 const prisma={favoriteTrack:{findMany:async value=>{query=value;return original.map(track=>({track}));}}};
 const storage={getSignedObjectUrl:async (_bucket,key)=>`/signed/${key}`};
 const config={get:()=>null};
 const result=await new AppController(config,prisma,storage).favoriteTracks({user:{id:'owner'}});
 assert.deepEqual(query.where,{userId:'owner'});
 assert.deepEqual(query.orderBy,{createdAt:'desc'});
 assert.equal(query.include.track.include.release.include.tracks,undefined,'do not query other album tracks or their waveform/audio payloads');
 assert.equal(query.include.track.include.audioFiles,true,'favorite audio is still fetched');
 for(let i=0;i<result.length;i++){
  assert.equal(result[i].id,original[i].id);assert.equal(result[i].position,original[i].position);
  assert.deepEqual(result[i].waveformData,original[i].waveformData);
  assert.equal(result[i].audioFiles[0].storageUrl,`/signed/normalized-${i}.mp3`);
  assert.deepEqual(result[i].release.tracks,[],'keep a compatible array without nested album payloads');
  assert.equal(result[i].release.coverStorageUrl,'/signed/front.jpg','desktop originals are preserved');
  assert.equal(result[i].release.coverThumbStorageUrl,'/signed/thumb.webp');
  assert.equal(result[i].release.backCoverUrl,'/signed/back.jpg');
  assert.equal(result[i].release.secondBackCoverUrl,'/signed/disc2back.jpg');
  assert.deepEqual(result[i].release.images,images,'gallery and side assignments are unchanged');
 }
 assert(!('tracks' in release),'response shaping does not mutate release data');
 console.log('PASS: lean favorites query, stable order/IDs/audio/waveforms, original and thumbnail covers, A/B/C/D assignments, compatible empty album-track array');
})().catch(e=>{console.error(e);process.exitCode=1});
