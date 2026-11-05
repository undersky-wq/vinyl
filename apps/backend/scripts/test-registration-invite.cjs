const assert = require('node:assert/strict');
require('ts-node').register({transpileOnly:true});
const {AuthService} = require('../src/modules/auth/auth.service.ts');

(async()=>{
  const settings=new Map();const users=[];
  const service=new AuthService({
    appSetting:{findUnique:async({where})=>settings.has(where.key)?{value:settings.get(where.key)}:null,upsert:async({where,create,update})=>settings.set(where.key,settings.has(where.key)?update.value:create.value)},
    user:{findUnique:async()=>null,create:async({data})=>{const user={...data,id:'test-'+users.length};users.push(user);return user;}},
  },{get:key=>({REGISTRATION_INVITE_CODE:'fixture-member-code',REGISTRATION_INVITE_CODE_ADMIN:'fixture-admin-code'})[key]},{});
  const input={email:'test@example.invalid',password:'test-only-password',displayName:'Test',privacyConsent:true};
  assert.equal((await service.getSiteSettings()).registrationInviteRequired,false);
  const free=await service.register(input);assert.equal(free.role,'USER');
  await service.updateAuthSettings({registrationInviteRequired:true});
  const publicSettings=await service.getSiteSettings();assert.equal(publicSettings.registrationInviteRequired,true);
  assert(!JSON.stringify(publicSettings).includes('fixture-'),'only a boolean is public, never the invite codes');
  await assert.rejects(service.register(input),/Invalid invite code/);
  await assert.rejects(service.register({...input,inviteCode:'incorrect'}),/Invalid invite code/);
  assert.equal((await service.register({...input,inviteCode:'fixture-member-code'})).role,'USER');
  await service.updateAuthSettings({registrationInviteRequired:false});
  assert.equal((await service.getSiteSettings()).registrationInviteRequired,false);
  assert.equal((await service.register(input)).role,'USER');
  console.log('PASS: public invite-required flag follows admin setting, secret codes stay private and backend still rejects missing/wrong codes (mock database only)');
})().catch(error=>{console.error(error);process.exitCode=1;});
