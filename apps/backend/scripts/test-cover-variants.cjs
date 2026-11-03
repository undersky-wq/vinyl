const assert=require('node:assert/strict');
const {Readable}=require('node:stream');
require('ts-node').register({transpileOnly:true});
const sharp=require('sharp');
const {ensureCoverVariants,coverVariantKeys}=require('../src/modules/storage/cover-variants.ts');
const {planCoverVariants,applyEntry}=require('./backfill-cover-variants.cjs');
const {ReleasesService}=require('../src/modules/releases/releases.service.ts');
const {signedTrackArtwork}=require('../src/modules/releases/release-track-artwork.ts');

(async()=>{
  const source=await sharp({create:{width:1400,height:1000,channels:3,background:'#bf8035'}}).png().toBuffer();
  const key='covers/manual/test/original.png',files=new Map([[key,source]]),uploads=[];
  let reads=0,fail=false;
  const storage={
    objectExists:async(_bucket,key)=>files.has(key),
    openDownload:async(_bucket,key)=>{reads++;return Readable.from([files.get(key)]);},
    uploadObject:async({key,body})=>{if(fail)throw Error('upload unavailable');uploads.push(key);files.set(key,body);return `/media/${key}`;},
    getSignedObjectUrl:async(_bucket,key)=>`/media/${key}`,
  };
  const [a,b]=await Promise.all([ensureCoverVariants(storage,'covers',key),ensureCoverVariants(storage,'covers',key)]);
  assert.deepEqual(a,b);assert.equal(reads,1);assert.equal(uploads.length,2);
  assert.strictEqual(files.get(key),source,'the original bytes are never overwritten');
  const small=await sharp(files.get(a.thumbStorageKey)).metadata(),medium=await sharp(files.get(a.mediumStorageKey)).metadata();
  assert.equal(small.width,320);assert.equal(small.height,320);assert.equal(small.format,'webp');
  assert.equal(medium.width,900);assert.equal(medium.height,643);
  await ensureCoverVariants(storage,'covers',key);
  assert.equal(reads,1);assert.equal(uploads.length,2,'repeat selections reuse prepared files');
  files.delete(a.thumbStorageKey);await ensureCoverVariants(storage,'covers',key);
  assert.equal(uploads.length,3,'repair only the missing variant');
  const legacy={thumbStorageKey:'covers/1/thumb.webp',mediumStorageKey:'covers/1/medium.webp'};
  files.set(legacy.thumbStorageKey,files.get(a.thumbStorageKey));files.set(legacy.mediumStorageKey,files.get(a.mediumStorageKey));
  assert.deepEqual(await ensureCoverVariants(storage,'covers',key,undefined,legacy),legacy,'reuse existing Discogs/manual renditions too');
  const image={id:'photo',releaseId:'release',storageKey:key,url:'/original',isBackCover:true,isSecondFrontCover:true};
  const release={id:'release',coverStorageKey:key,coverThumbStorageKey:key,coverMediumStorageKey:key,images:[image]};
  const plan=planCoverVariants([release,{id:'hidden',coverStorageKey:null,images:[{id:'unused',storageKey:'covers/unused.jpg',type:'GALLERY'}]}]);
  assert.equal(plan.length,1,'one photo shared across several sides is prepared once; hidden fronts stay hidden');
  const service=Object.create(ReleasesService.prototype);
  service.storageService=storage;service.configService={get:()=>null};service.findOne=async()=>release;
  const tx={image:{
    findFirst:async()=>image,
    updateMany:async({where,data})=>{if(where.id){assert.equal(where.storageKey,key);Object.assign(image,data);return {count:1};}return {count:0};},
    update:async({data})=>Object.assign(image,data),
  },release:{update:async({data})=>Object.assign(release,data),updateMany:async({where,data})=>{if(release.coverStorageKey===where.coverStorageKey){Object.assign(release,data);return {count:1};}return {count:0};}}};
  service.prisma={...tx,$transaction:async fn=>fn(tx)};
  const beforeAssignments={back:image.isBackCover,second:image.isSecondFrontCover,key:image.storageKey};
  await applyEntry(service.prisma,storage,'covers',plan[0]);
  assert.notEqual(release.coverThumbStorageKey,key);
  assert.deepEqual({back:image.isBackCover,second:image.isSecondFrontCover,key:image.storageKey},beforeAssignments);
  const beforeUploads=uploads.length;
  await service.selectCover('release','photo','front');
  assert.equal(uploads.length,beforeUploads,'editor reuses backfilled renditions');
  assert.equal(release.images.length,1,'the gallery has no extra rows');
  release.coverStorageKey='covers/new-selection.png';
  await applyEntry(service.prisma,storage,'covers',plan[0]);
  assert.equal(release.coverStorageKey,'covers/new-selection.png','backfill never overwrites a newer selected original');
  const unavailable='covers/fail.png';files.set(unavailable,source);fail=true;
  await assert.rejects(()=>ensureCoverVariants(storage,'covers',unavailable),/upload unavailable/);
  fail=false;await ensureCoverVariants(storage,'covers',unavailable);
  assert(files.has(coverVariantKeys(unavailable).thumbStorageKey),'a failed generation can be retried');
  const brokenKey='covers/broken-source.png';files.set(brokenKey,Buffer.from('not an image'));
  let transactions=0;
  service.prisma={image:{findFirst:async()=>({id:'broken',releaseId:'release',storageKey:brokenKey,url:'/broken'})},$transaction:async()=>{transactions++;}};
  await assert.rejects(()=>service.selectCover('release','broken','front'));
  assert.equal(transactions,0,'failed rendition preparation never changes a selected face');
  const double={coverStorageKey:'covers/a.jpg',images:[
    {storageKey:'covers/b.jpg',thumbStorageKey:'covers/b-small.webp',mediumStorageKey:'covers/b-medium.webp',url:'/b',isBackCover:true},
    {storageKey:'covers/c.jpg',thumbStorageKey:'covers/c-small.webp',url:'/c',isSecondFrontCover:true},
    {storageKey:'covers/d.jpg',thumbStorageKey:'covers/d-small.webp',url:'/d',isSecondBackCover:true},
  ]};
  const sign=async key=>`/${key}`;
  assert.equal((await signedTrackArtwork(double,'B1',sign)).coverUrl,'/covers/b-small.webp');
  assert.equal((await signedTrackArtwork(double,'C1',sign)).coverUrl,'/covers/c-small.webp');
  const d=await signedTrackArtwork(double,'D1',sign);
  assert.equal(d.coverUrl,'/covers/d-small.webp');assert.equal(d.coverFullUrl,'/covers/d.jpg');
  console.log('PASS: 320/900 WebP, immutable originals, concurrency deduplication, reuse and missing-file repair, editor/backfill shared-photo semantics, stale-selection guard, retry, A/B/C/D small and full artwork');
})().catch(error=>{console.error(error);process.exitCode=1;});
