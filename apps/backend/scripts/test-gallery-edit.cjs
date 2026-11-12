const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
require('ts-node').register({ transpileOnly: true });
const sharp = require('sharp');
const { ReleasesService } = require('../src/modules/releases/releases.service.ts');
(async () => {
  const original = await sharp({ create: { width: 24, height: 32, channels: 3, background: 'red' } }).png().toBuffer();
  const objects = new Map([['covers/old.png', original]]);
  const release = { id:'release', coverStorageKey:'covers/old.png', coverStorageUrl:'/old', coverImageUrl:'/old' };
  const images = [{id:'front',releaseId:'release',storageKey:'covers/old.png',url:'/old',type:'COVER',isBackCover:true,isSecondFrontCover:false,isSecondBackCover:false}];
  let nextId=0, failUpload=false;
  const matches = (value, where) => Object.entries(where).every(([key, expected]) => key==='OR' ? expected.some(clause=>matches(value,clause)) : value[key]===expected);
  const prisma = {
    release: { findUnique:async({where})=>where.id===release.id?release:null, update:async({data})=>Object.assign(release,data), count:async({where})=>Number(matches(release,where)) },
    image: {
      findFirst:async({where})=>images.find(image=>matches(image,where))||null,
      create:async({data})=>{const row={id:`new-${++nextId}`,isBackCover:false,isSecondFrontCover:false,isSecondBackCover:false,...data};images.push(row);return row;},
      update:async({where,data})=>Object.assign(images.find(image=>image.id===where.id),data),
      delete:async({where})=>images.splice(images.findIndex(image=>image.id===where.id),1)[0],
      count:async({where})=>images.filter(image=>matches(image,where)).length,
    },
  };
  prisma.$transaction = operation=>operation(prisma);
  const service=Object.create(ReleasesService.prototype);
  service.prisma=prisma;service.configService={get:()=> 'covers'};service.galleryLogger={warn:()=>{}};
  service.findOne=async()=>({...release,images:images.map(image=>({...image}))});
  service.storageService={objectExists:async(bucket,key)=>objects.has(key),getSignedObjectUrl:async(bucket,key)=>`/${key}`,
    uploadObject:async({key,body})=>{if(failUpload)throw Error('upload failed');objects.set(key,body);return `/${key}`;},
    openDownload:async(bucket,key)=>Readable.from([objects.get(key)]),deleteObject:async(bucket,key)=>objects.delete(key)};
  await assert.rejects(()=>service.readGalleryImage('other','front'),/not found/);
  await service.copyGalleryImage('release','front');
  assert.equal(images.length,2);assert.equal(images[1].type,'GALLERY');assert.equal(images[1].isBackCover,false);
  assert.notEqual(images[1].storageKey,images[0].storageKey);assert.deepEqual(objects.get(images[1].storageKey),original,'copy keeps original bytes');
  const copiedKey=images[1].storageKey;
  await service.saveGalleryImage('release',{buffer:original,mimetype:'image/png'},'front');
  assert.equal(images.length,2);assert.equal(images[0].id,'front');assert.equal(images[0].type,'COVER');assert.equal(images[0].isBackCover,true);
  assert.equal(release.coverStorageKey,images[0].storageKey);assert(objects.has(copiedKey),'editing original leaves independent copy intact');
  const before=images[0].storageKey;
  failUpload=true;
  await assert.rejects(()=>service.saveGalleryImage('release',{buffer:original,mimetype:'image/png'},'front'),/upload failed/);
  assert.equal(images[0].storageKey,before,'failed upload leaves selected cover unchanged');failUpload=false;
  await service.deleteGalleryImage('release','front',true);
  assert.equal(images.length,1);assert.equal(release.coverStorageKey,null);assert.equal(release.coverImageUrl,null);
  assert(objects.has(copiedKey),'deleting original does not remove its copy');
  assert(!objects.has(before),'deleted source file is removed');
  console.log('PASS: gallery copy preserves bytes and is independent; editing preserves image ID/side flags; failure preserves old cover; assigned deletion detaches it and keeps copies');
})().catch(error=>{console.error(error);process.exitCode=1;});
