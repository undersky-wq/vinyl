const fs=require('node:fs/promises');
const compiled=require('node:fs').existsSync(require('node:path').join(__dirname,'../dist/modules/storage/cover-variants.js'))&&process.env.NODE_ENV==='production';
if(!compiled)require('ts-node').register({transpileOnly:true});
const {ensureCoverVariants}=require(compiled?'../dist/modules/storage/cover-variants.js':'../src/modules/storage/cover-variants.ts');

function planCoverVariants(releases) {
  const plan=[];
  for(const release of releases)for(const image of release.images||[]) {
    const front=image.storageKey===release.coverStorageKey;
    if(!front&&!image.isBackCover&&!image.isSecondFrontCover&&!image.isSecondBackCover)continue;
    const thumb=image.thumbStorageKey||(front?release.coverThumbStorageKey:null);
    const medium=image.mediumStorageKey||(front?release.coverMediumStorageKey:null);
    plan.push({releaseId:release.id,imageId:image.id,sourceKey:image.storageKey,front,
      preferred:{thumbStorageKey:thumb&&thumb!==image.storageKey?thumb:null,mediumStorageKey:medium&&medium!==image.storageKey?medium:null},
    });
  }
  return plan;
}

async function applyEntry(prisma,storage,bucket,entry) {
  const variants=await ensureCoverVariants(storage,bucket,entry.sourceKey,undefined,entry.preferred);
  const [thumbUrl,mediumUrl]=await Promise.all([
    storage.getSignedObjectUrl(bucket,variants.thumbStorageKey),storage.getSignedObjectUrl(bucket,variants.mediumStorageKey),
  ]);
  return prisma.$transaction(async tx=>{
    const result=await tx.image.updateMany({where:{id:entry.imageId,releaseId:entry.releaseId,storageKey:entry.sourceKey},data:variants});
    if(result.count!==1)throw Error('Image changed or was removed; skip stale backfill entry');
    // Only update rendition pointers when this exact original is still selected.
    if(entry.front)await tx.release.updateMany({where:{id:entry.releaseId,coverStorageKey:entry.sourceKey},data:{
      coverThumbStorageKey:variants.thumbStorageKey,coverThumbStorageUrl:thumbUrl,
      coverMediumStorageKey:variants.mediumStorageKey,coverMediumStorageUrl:mediumUrl,
    }});
    return variants;
  });
}

async function main() {
  const args=process.argv.slice(2);
  const value=flag=>args[args.indexOf(flag)+1];
  if(args.includes('--inventory')) {
    const report=JSON.parse(await fs.readFile(value('--inventory'),'utf8'));
    const plan=planCoverVariants(report.releases);
    console.log(JSON.stringify({dryRun:true,images:plan.length,existingVariantReferences:plan.filter(item=>item.preferred.thumbStorageKey&&item.preferred.mediumStorageKey).length,needsVariants:plan.filter(item=>!item.preferred.thumbStorageKey||!item.preferred.mediumStorageKey).length},null,2));
    return;
  }
  const apply=args.includes('--apply');
  if(apply&&(!args.includes('--backup')||process.env.ALLOW_COVER_VARIANT_BACKFILL!=='1'))throw Error('Apply requires --backup <new-file.json> and ALLOW_COVER_VARIANT_BACKFILL=1');
  const {PrismaClient}=require('@prisma/client');
  const {ConfigService}=require('@nestjs/config');
  const {StorageService}=require(compiled?'../dist/modules/storage/storage.service.js':'../src/modules/storage/storage.service.ts');
  const prisma=new PrismaClient();
  let storage;
  try {
    const releases=await prisma.release.findMany({select:{id:true,coverStorageKey:true,coverThumbStorageKey:true,coverThumbStorageUrl:true,coverMediumStorageKey:true,coverMediumStorageUrl:true,images:true}});
    const plan=planCoverVariants(releases);
    console.log(JSON.stringify({dryRun:!apply,releases:releases.length,images:plan.length}));
    if(!apply)return;
    await fs.writeFile(value('--backup'),JSON.stringify({createdAt:new Date().toISOString(),releases,plan},null,2),{flag:'wx'});
    storage=new StorageService(new ConfigService());
    const bucket=process.env.SELECTEL_S3_BUCKET_COVERS||'covers';
    let completed=0;
    // Sequential processing keeps this maintenance job below interactive traffic.
    for(const entry of plan){await applyEntry(prisma,storage,bucket,entry);completed++;if(completed%25===0)console.log(`Prepared ${completed}/${plan.length}`);}
    console.log(`COVER_VARIANTS_PREPARED ${completed}; originals and side assignments unchanged`);
  } finally {await prisma.$disconnect();storage?.client?.destroy();}
}

module.exports={planCoverVariants,applyEntry};
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
