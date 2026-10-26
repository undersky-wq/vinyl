const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto').webcrypto;
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../src/lib/music-engagement.ts'), 'utf8');
const events = [];
const requests = [];
let ok = true;
const storage = new Map();
const context = {
  exports: {}, crypto,
  localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
  CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
  window: { dispatchEvent: event => events.push(event) },
  fetch: async (url, options) => {
    requests.push({ url, options });
    return { ok, json: async () => ({ favorites: 2, plays: 3, copies: 4 }) };
  },
};
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, context);

(async () => {
  const result = await context.exports.recordMusicLinkCopy('mix/1');
  assert.equal(result.copies, 4);
  assert.equal(requests[0].url, '/api/releases/mix%2F1/copies');
  assert.equal(requests[0].options.method, 'POST');
  assert.match(JSON.parse(requests[0].options.body).requestId, /^[a-f0-9]{36}$/);
  assert.equal(events.length, 1);
  assert.equal(events[0].detail, 'mix/1');
  await context.exports.recordMusicLinkCopy('mix/1');
  assert.equal(requests[1].options.method, undefined, 'Repeat copies must only read the counter');
  assert.equal(events.length, 1);
  // Recreate the module to simulate a page reload with persistent browser storage.
  const reloaded = { ...context, exports: {} };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, reloaded);
  await reloaded.exports.recordMusicLinkCopy('mix/1');
  assert.equal(requests[2].options.method, undefined, 'Reload must preserve the copy receipt');
  ok = false;
  await assert.rejects(reloaded.exports.recordMusicLinkCopy('mix/2'));
  const failedRequest = JSON.parse(requests[3].options.body).requestId;
  assert.equal(events.length, 1, 'Failed requests must not announce a counter update');
  ok = true;
  await Promise.all([reloaded.exports.recordMusicLinkCopy('mix/2'), reloaded.exports.recordMusicLinkCopy('mix/2')]);
  assert.equal(requests.length, 5, 'Concurrent requests must be coalesced');
  assert.equal(JSON.parse(requests[4].options.body).requestId, failedRequest, 'Retry must reuse its idempotency key');
  assert.equal(events.length, 2);
  await reloaded.exports.recordMusicLinkCopy('mix/1', 'account-a');
  assert.equal(requests[5].options.method, 'POST', 'Guest receipt must not suppress a signed-in account');
  assert.equal(requests[5].options.credentials, 'include');
  await reloaded.exports.recordMusicLinkCopy('mix/1', 'account-a');
  assert.equal(requests[6].options.method, undefined, 'Same account must retain its receipt');
  await reloaded.exports.recordMusicLinkCopy('mix/1', 'account-b');
  assert.equal(requests[7].options.method, 'POST', 'Different accounts must not share a receipt');
  console.log('Music link copy counter tests passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
