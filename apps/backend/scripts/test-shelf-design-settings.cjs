const assert=require('node:assert/strict');
require('ts-node').register({transpileOnly:true});
const {AuthService}=require('../src/modules/auth/auth.service.ts');
const {UpdateAuthSettingsDto}=require('../src/modules/auth/dto/auth.dto.ts');
const {validate}=require('class-validator');
async function main(){
 const values=new Map();
 const prisma={appSetting:{findUnique:async({where})=>values.has(where.key)?{value:values.get(where.key)}:null,upsert:async({where,update})=>values.set(where.key,update.value)}};
 const service=new AuthService(prisma,{}, {},{});
 let settings=await service.getSiteSettings();
 for(const key of ['shelfWaveEnabled','shelfSpinEnabled','shelfShuffleEnabled'])assert.equal(settings[key],true);
 assert.equal(settings.shelfShakeSensitivity,50);
 await service.updateAuthSettings({shelfShakeSensitivity:0});assert.equal((await service.getSiteSettings()).shelfShakeSensitivity,0);
 await service.updateAuthSettings({shelfShakeSensitivity:100});assert.equal((await service.getSiteSettings()).shelfShakeSensitivity,100);
 await service.updateAuthSettings({shelfWaveEnabled:false,shelfSpinEnabled:false});
 settings=await service.getSiteSettings();assert.equal(settings.shelfWaveEnabled,false);assert.equal(settings.shelfSpinEnabled,false);assert.equal(settings.shelfShuffleEnabled,true);
 await service.updateAuthSettings({shelfShuffleEnabled:false});settings=await service.getSiteSettings();assert.equal(settings.shelfWaveEnabled,false);assert.equal(settings.shelfShuffleEnabled,false);
 assert.equal(settings.shelfShakeSensitivity,100,'Other design patches retain sensitivity');
 for(const value of [-1,101,50.5,'50',NaN]){const dto=Object.assign(new UpdateAuthSettingsDto(),{shelfShakeSensitivity:value});assert.ok((await validate(dto)).length);}
 for(const value of [0,50,100]){const dto=Object.assign(new UpdateAuthSettingsDto(),{shelfShakeSensitivity:value});assert.equal((await validate(dto)).length,0);}
 values.set('shelfShakeSensitivity','broken');assert.equal((await service.getSiteSettings()).shelfShakeSensitivity,50);
 const bad=Object.assign(new UpdateAuthSettingsDto(),{shelfSpinEnabled:'false'});assert.ok((await validate(bad)).length);
 const valid=Object.assign(new UpdateAuthSettingsDto(),{shelfSpinEnabled:false});assert.equal((await validate(valid)).length,0);
 console.log('PASS: persisted design toggles, public defaults, independent patches and boolean validation');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
