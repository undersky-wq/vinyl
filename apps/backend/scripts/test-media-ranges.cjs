const assert = require('node:assert/strict');
const { mkdtemp, writeFile, rm } = require('node:fs/promises');
const { finished } = require('node:stream/promises');
const { Writable } = require('node:stream');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
require('reflect-metadata');
require('ts-node').register({ transpileOnly: true });
const { StorageController } = require('../src/modules/storage/storage.controller.ts');

async function main() {
  const directory = await mkdtemp(join(tmpdir(), 'vinyl-range-'));
  const file = join(directory, 'track.mp3');
  const content = Buffer.from(Array.from({ length: 1000 }, (_, i) => i % 251));
  const controller = new StorageController(
    { isLocalBucket: () => true, resolveLocalObjectPath: () => file },
    { getAuthSettings: async () => ({}), getUserFromRequest: async () => ({ id: 'test' }) },
    {},
  );
  async function check(range, status, contentRange, body, method = 'GET', extra = {}, length = body.length) {
    const chunks = [];
    const response = new Writable({ write(chunk, _, cb) { chunks.push(chunk); cb(); } });
    const headers = {};
    response.statusCode = 200;
    response.status = code => { response.statusCode = code; return response; };
    response.setHeader = (key, value) => { headers[key] = value; return response; };
    await controller.streamLocalObject('audio', { method, params: { key: 'track.mp3' }, headers: { range, ...extra } }, response);
    await finished(response);
    assert.equal(response.statusCode, status, range);
    assert.equal(headers['Content-Range'], contentRange, range);
    if (status !== 416) assert.equal(headers['Content-Length'], length, range);
    assert.deepEqual(Buffer.concat(chunks), body, range);
  }
  const empty = Buffer.alloc(0);
  try {
    await writeFile(file, content);
    await check('bytes=-100', 206, 'bytes 900-999/1000', content.subarray(900));
    await check('bytes=-5000', 206, 'bytes 0-999/1000', content);
    await check('bytes=900-9999', 206, 'bytes 900-999/1000', content.subarray(900));
    await check('bytes=900-', 206, 'bytes 900-999/1000', content.subarray(900));
    await check('bytes=0-0', 206, 'bytes 0-0/1000', content.subarray(0, 1));
    for (const range of ['bytes=-0', 'bytes=-', 'bytes=1000-', 'bytes=50-20']) {
      await check(range, 416, 'bytes */1000', empty);
    }
    await check('bytes=-100', 200, undefined, empty, 'HEAD', {}, 1000);
    await check('bytes=5-6', 200, undefined, content, 'GET', { 'if-range': '"old"' });
    await check('bytes=0-0,5-5', 200, undefined, content);
    await writeFile(file, empty);
    await check('bytes=-100', 200, undefined, empty);
  } finally {
    await rm(file, { force: true });
    await require('node:fs/promises').rmdir(directory);
  }
  console.log('PASS: actual range bytes, suffix, clipping, open-ended, invalid, HEAD, If-Range, empty files');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
