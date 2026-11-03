const assert = require('node:assert/strict');
require('ts-node').register({ transpileOnly: true });
const { signedTrackArtwork } = require('../src/modules/releases/release-track-artwork.ts');
const { signedBackCoverUrl } = require('../src/modules/releases/release-back-cover.ts');
const { ReleasesService } = require('../src/modules/releases/releases.service.ts');
const { AppController } = require('../src/modules/app.controller.ts');

(async()=>{
  const release={id:'double',artist:'Artist',coverStorageKey:'a.jpg',coverThumbStorageKey:'a-thumb.jpg',coverImageUrl:'/a',coverStorageUrl:'/a',images:[
    {storageKey:'b.jpg',url:'/b',isBackCover:true},
    {storageKey:'c.jpg',url:'/c',isSecondFrontCover:true},
    {storageKey:'d.jpg',url:'/d',isSecondBackCover:true},
  ]};
  const sign=async key=>`/signed/${key}`;
  for(const [position,expected] of [['A1','a-thumb.jpg'],['B2','b.jpg'],['C1','c.jpg'],['D2','d.jpg'],[' c ','c.jpg'],[' d1 ','d.jpg']]) {
    const artwork=await signedTrackArtwork(release,position,sign);
    assert.equal(artwork.coverUrl,`/signed/${expected}`,position);
    assert.equal(artwork.coverSide,/^[bd]/i.test(position.trim())?'back':'front');
  }
  assert.equal((await signedTrackArtwork({...release,images:release.images.slice(0,2)},'D1',sign)).coverUrl,'/signed/c.jpg','missing D falls back to C, never B');
  assert.equal((await signedTrackArtwork({...release,images:[release.images[0]]},'D1',sign)).coverUrl,'/signed/a-thumb.jpg','unconfigured second vinyl uses the main front');
  assert.equal(await signedBackCoverUrl(release.images,sign,'front2'),'/signed/c.jpg');
  assert.equal(await signedBackCoverUrl(release.images,sign,'back2'),'/signed/d.jpg');
  const service=Object.create(ReleasesService.prototype);
  service.configService={get:()=>null};
  service.storageService={getSignedObjectUrl:async(_bucket,key)=>sign(key)};
  const details=await service.signReleaseUrls({...release,tracks:[]});
  assert.equal(details.backCoverUrl,'/signed/b.jpg');
  assert.equal(details.secondCoverUrl,'/signed/c.jpg');
  assert.equal(details.secondBackCoverUrl,'/signed/d.jpg');
  const track={id:'d1',title:'D track',position:'D1',releaseId:'double',artists:[],release,audioFiles:[],waveformData:[]};
  const controller=new AppController(service.configService,{track:{findUnique:async()=>track}},service.storageService);
  const player=await controller.playerTrack('d1');
  assert.equal(player.coverUrl,'/signed/d.jpg','refreshing a player track keeps D artwork');
  assert.equal(player.frontCoverFullUrl,'/signed/c.jpg');
  assert.equal(player.position,'D1');
  console.log('PASS: A/B/C/D artwork, independent disc faces, safe fallback, signed release details and player refresh');
})().catch(error=>{console.error(error);process.exitCode=1;});
