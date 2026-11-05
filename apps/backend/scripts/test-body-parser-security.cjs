const assert = require('node:assert/strict');
const http = require('node:http');
const { fork } = require('node:child_process');
const { once } = require('node:events');
const { createRequire } = require('node:module');
const { gzipSync } = require('node:zlib');

async function serve() {
  require('reflect-metadata');
  const { NestFactory } = require('@nestjs/core');
  const { Controller, Get, Post, Req, Module } = require('@nestjs/common');
  class TestController {
    health() { return { ok: true }; }
    echo(request) { return request.body; }
  }
  Controller('api')(TestController);
  Get('health')(TestController.prototype, 'health', Object.getOwnPropertyDescriptor(TestController.prototype, 'health'));
  Post('echo')(TestController.prototype, 'echo', Object.getOwnPropertyDescriptor(TestController.prototype, 'echo'));
  Req()(TestController.prototype, 'echo', 0);
  class TestModule {}
  Module({ controllers: [TestController] })(TestModule);
  const app = await NestFactory.create(TestModule, { logger: false });
  await app.listen(0, '127.0.0.1');
  process.send({ base: await app.getUrl() });
  process.on('message', async message => {
    if (message === 'stop') { await app.close(); process.disconnect(); }
  });
}

function request(base, route, body, encoding) {
  return new Promise((resolve, reject) => {
    const headers = body ? { 'Content-Type': 'application/json', 'Content-Length': body.length } : {};
    if (encoding) headers['Content-Encoding'] = encoding;
    const req = http.request(new URL(route, base), {
      method: body ? 'POST' : 'GET', headers, timeout: 5000,
    }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode, text: Buffer.concat(chunks).toString() }));
      response.on('error', reject);
    });
    req.on('timeout', () => req.destroy(Error('Request timed out')));
    req.on('error', reject);
    req.end(body);
  });
}

async function main() {
  const packageInfo = require('../package.json');
  assert.equal(packageInfo.overrides['body-parser'], '2.4.0');
  const expressRequire = createRequire(require.resolve('express'));
  assert.equal(expressRequire('body-parser/package.json').version, '2.4.0', 'Express must resolve the patched parser');
  const child = fork(__filename, ['--server'], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
  const exited = once(child, 'exit');
  let diagnostics = '';
  child.stderr.on('data', value => { diagnostics += value; });
  const timeout = setTimeout(() => child.kill(), 15000);
  try {
    const ready = await Promise.race([
      once(child, 'message').then(([message]) => message),
      exited.then(([code]) => { throw Error(`Test server exited: ${code}\n${diagnostics}`); }),
    ]);
    const body = Buffer.from('{"ok":true}');
    for (const [payload, encoding] of [[body], [gzipSync(body), 'gzip']]) {
      const result = await request(ready.base, '/api/echo', payload, encoding);
      assert.equal(result.status, 201);
      assert.deepEqual(JSON.parse(result.text), { ok: true });
    }
    // Run malformed compressed input only against this disposable local process.
    const malformed = [Buffer.from('not gzip'), Buffer.concat([gzipSync(body), Buffer.from('trailing bytes')])];
    for (const payload of malformed) {
      const result = await request(ready.base, '/api/echo', payload, 'gzip');
      assert.equal(result.status, 400);
      await new Promise(resolve => setTimeout(resolve, 50));
      assert.equal(child.exitCode, null, diagnostics);
      const health = await request(ready.base, '/api/health');
      assert.equal(health.status, 200);
      assert.deepEqual(JSON.parse(health.text), { ok: true });
    }
    const final = await request(ready.base, '/api/echo', body);
    assert.equal(final.status, 201, 'Normal requests must still work after malformed compression');
    console.log('PASS: Express uses body-parser 2.4.0; JSON/gzip work; malformed gzip and trailing bytes return 400 without stopping NestJS');
  } finally {
    if (child.connected) child.send('stop');
    await exited;
    clearTimeout(timeout);
  }
}

(process.argv.includes('--server') ? serve() : main()).catch(error => { console.error(error); process.exitCode = 1; });
