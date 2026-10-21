const assert = require('node:assert/strict');
require('ts-node').register({transpileOnly:true});
const { ReleasesService } = require('../src/modules/releases/releases.service.ts');
const { ReleasesController } = require('../src/modules/releases/releases.controller.ts');
const likes = new Set();
const tx = {
  timelineComment: {findFirst:async ({where}) => where.id === 'comment' && where.releaseId === 'release' ? {id:'comment'} : null},
  timelineCommentLike: {
    upsert:async ({create}) => likes.add(`${create.commentId}:${create.userId}`),
    deleteMany:async ({where}) => likes.delete(`${where.commentId}:${where.userId}`),
    count:async ({where}) => [...likes].filter(key => key.startsWith(`${where.commentId}:`)).length,
  },
};
const service = Object.assign(Object.create(ReleasesService.prototype), {prisma:{$transaction: callback => callback(tx)}});
async function main() {
  assert.deepEqual(await service.setTimelineCommentLike('release','comment','a',true), {likeCount:1,likedByMe:true});
  assert.equal((await service.setTimelineCommentLike('release','comment','a',true)).likeCount,1);
  assert.equal((await service.setTimelineCommentLike('release','comment','b',true)).likeCount,2);
  assert.equal((await service.setTimelineCommentLike('release','comment','a',false)).likeCount,1);
  assert.equal((await service.setTimelineCommentLike('release','comment','a',false)).likeCount,1);
  await assert.rejects(service.setTimelineCommentLike('wrong','comment','a',true), {status:404});
  for (const method of ['likeTimelineComment','unlikeTimelineComment']) {
    assert(Reflect.getMetadata('__guards__', ReleasesController.prototype[method]).some(guard => guard.name === 'AuthGuard'));
  }
  const schema = require('node:fs').readFileSync('prisma/schema.prisma','utf8');
  assert(schema.includes('@@id([commentId, userId])'));
  console.log('PASS: unique user likes, idempotent set/remove, shared counts, release isolation, authenticated endpoints (mock DB)');
}
main().catch(error => {console.error(error);process.exitCode=1;});
