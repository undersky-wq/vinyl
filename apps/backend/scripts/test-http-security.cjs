const assert = require('node:assert/strict');
require('ts-node').register({ transpileOnly: true });
const { NestFactory } = require('@nestjs/core');
const { Module } = require('@nestjs/common');
const { configureHttpSecurity } = require('../src/shared/http-security.ts');

async function main() {
  class TestModule {}
  Module({})(TestModule);
  const app = await NestFactory.create(TestModule, { logger: false });
  configureHttpSecurity(app, { NODE_ENV: 'production', APP_URL: 'https://mityadima.ru' });
  const server = app.getHttpAdapter().getInstance();
  server.get('/api/auth/me', (req, res) => res.json({ anonymous: true }));
  server.post('/api/auth/login', (req, res) => res.status(req.headers['x-test-success'] ? 200 : 401).json({ ok: false }));
  server.post('/api/auth/register', (req, res) => res.status(400).json({ ok: false }));
  await app.listen(0, '127.0.0.1');
  const base = await app.getUrl();
  try {
    let response = await fetch(`${base}/api/auth/me`, { headers: { Origin: 'https://mityadima.ru' } });
    assert.equal(response.headers.get('access-control-allow-origin'), 'https://mityadima.ru');
    assert.equal(response.headers.get('x-powered-by'), null);
    assert.equal(response.headers.get('x-frame-options'), 'DENY');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.ok(response.headers.get('strict-transport-security'));
    assert.match(response.headers.get('content-security-policy'), /frame-ancestors 'none'/);
    for (const origin of ['https://audit.invalid', 'https://mityadima.ru.evil.invalid', 'null']) {
      response = await fetch(`${base}/api/auth/me`, { headers: { Origin: origin } });
      assert.equal(response.headers.get('access-control-allow-origin'), null);
      response = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { Origin: origin } });
      assert.equal(response.status, 403);
    }
    response = await fetch(`${base}/api/auth/login`, { method: 'OPTIONS', headers: {
      Origin: 'https://www.mityadima.ru', 'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type',
    } });
    assert.equal(response.status, 204);
    assert.equal(response.headers.get('access-control-allow-origin'), 'https://www.mityadima.ru');
    // Native clients without Origin are supported. Forging the LEFT side of
    // nginx's XFF chain must not yield a new limiter identity.
    for (let index = 0; index < 15; index++) {
      response = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: {
        'X-Forwarded-For': `198.51.100.${index + 1}, 192.0.2.10`,
      } });
      assert.equal(response.status, 401);
    }
    response = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'X-Forwarded-For': '203.0.113.9, 192.0.2.10' } });
    assert.equal(response.status, 429);
    assert.ok(Number(response.headers.get('retry-after')) > 0);
    for (let index = 0; index < 18; index++) {
      response = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: {
        'X-Forwarded-For': '192.0.2.11', 'X-Test-Success': '1',
      } });
      assert.equal(response.status, 200, 'Successful logins must not exhaust the failure budget');
    }
    for (let index = 0; index < 6; index++) {
      response = await fetch(`${base}/api/auth/register`, { method: 'POST', headers: { 'X-Forwarded-For': '192.0.2.12' } });
      assert.equal(response.status, index < 5 ? 400 : 429);
    }
    console.log('PASS: CORS allowlist, CSRF origin rejection, native clients, headers, login/register limits, successful login budget and forged-XFF resistance');
  } finally { await app.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
