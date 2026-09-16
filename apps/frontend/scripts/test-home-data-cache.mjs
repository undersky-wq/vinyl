import { strict as assert } from 'node:assert';
import { getPublicHomeData } from '../src/lib/home-data-cache.ts';

let calls = 0;
const load = async () => { calls++; return [1, 2]; };
await Promise.all(Array.from({ length: 20 }, () => getPublicHomeData('parallel', load)));
assert.equal(calls, 1, 'parallel requests share one load');
await getPublicHomeData('parallel', load);
assert.equal(calls, 1, 'successful data is reused');
let failures = 0;
const fail = async () => { failures++; throw new Error('expected'); };
await getPublicHomeData('failure', fail).catch(() => {});
await getPublicHomeData('failure', fail).catch(() => {});
assert.equal(failures, 2, 'failed loads are not cached');
const originalNow = Date.now;
try {
  Date.now = () => originalNow() + 31_000;
  await getPublicHomeData('parallel', load);
  assert.equal(calls, 2, 'data expires after 30 seconds');
} finally {
  Date.now = originalNow;
}
console.log('PASS: coalescing, cache hit, failure retry, TTL expiry');
