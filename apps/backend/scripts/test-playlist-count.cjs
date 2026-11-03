const assert=require('node:assert/strict');
require('ts-node').register({transpileOnly:true});
const {GUARDS_METADATA,PATH_METADATA}=require('@nestjs/common/constants');
const {PlaylistsService}=require('../src/modules/playlists/playlists.service.ts');
const {PlaylistsController}=require('../src/modules/playlists/playlists.controller.ts');
const {AuthGuard}=require('../src/modules/auth/auth.guards.ts');

(async()=>{
  const calls=[];
  const service=Object.create(PlaylistsService.prototype);
  service.prisma={playlist:{count:async options=>{calls.push(options);return options.where.userId==='empty'?0:12;}}};
  service.storageService=new Proxy({},{get:()=>{throw Error('Counting must not touch storage');}});
  assert.deepEqual(await service.count('user-one'),{count:12});
  assert.deepEqual(await service.count('empty'),{count:0});
  assert.deepEqual(calls,[{where:{userId:'user-one'}},{where:{userId:'empty'}}]);
  const controller=new PlaylistsController(service,{});
  assert.deepEqual(await controller.count({user:{id:'empty'}}),{count:0});
  assert.equal(Reflect.getMetadata(PATH_METADATA,PlaylistsController.prototype.count),'count');
  assert(Reflect.getMetadata(GUARDS_METADATA,PlaylistsController.prototype.count).includes(AuthGuard));
  const methods=Object.getOwnPropertyNames(PlaylistsController.prototype);
  assert(methods.indexOf('count')<methods.indexOf('findOne'),'static route precedes the playlist ID route');
  console.log('PASS: authenticated playlist count scopes to current user, includes empty result, does not load playlist contents or sign audio/artwork URLs');
})().catch(error=>{console.error(error);process.exitCode=1;});
