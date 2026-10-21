const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
require('ts-node').register({ transpileOnly: true });
const { NestFactory } = require('@nestjs/core');
const { Module } = require('@nestjs/common');
const { configureSecurityAudit } = require('../src/shared/security-audit.ts');
const { configureHttpSecurity } = require('../src/shared/http-security.ts');
const { AdminGuard } = require('../src/modules/auth/auth.guards.ts');

async function main() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'vinyl-audit-'));
  const file = path.join(directory, 'audit.jsonl');
  class TestModule {}
  Module({})(TestModule);
  const app = await NestFactory.create(TestModule, { logger: false });
  configureSecurityAudit(app, { NODE_ENV: 'production', SECURITY_AUDIT_FILE: file });
  configureHttpSecurity(app, { NODE_ENV: 'production', APP_URL: 'https://mityadima.ru' });
  const server = app.getHttpAdapter().getInstance();
  server.get('/api/health', (_, res) => res.json({ ok: true }));
  server.post('/api/auth/login', (req, res) => {
    if (!req.headers['x-test-login']) return res.status(401).json({ password: 'NEVER_STORE_SECRET' });
    res.cookie('vinyl_session', 'NEVER_STORE_SECRET');
    return res.status(201).json({ id: 'admin-id', role: 'ADMIN', email: 'NEVER_STORE_SECRET', token: 'NEVER_STORE_SECRET' });
  });
  const guard = new AdminGuard({ getUserFromRequest: async req => req.headers['x-test-role'] ? { id: 'actor-id', role: req.headers['x-test-role'] } : null });
  server.post('/api/admin/example', async (req, res) => {
    try {
      await guard.canActivate({ switchToHttp: () => ({ getRequest: () => req }) });
      res.status(201).json({ ok: true });
    } catch (error) { res.status(error.getStatus()).json({ ok: false }); }
  });
  await app.listen(0, '127.0.0.1');
  const base = await app.getUrl();
  try {
    await fetch(`${base}/api/health`);
    await fetch(`${base}/api/auth/login?token=NEVER_STORE_SECRET`, { method: 'POST', headers: { 'x-test-login': '1', 'x-forwarded-for': '1.2.3.4, 198.51.100.20' } });
    await fetch(`${base}/api/auth/login`, { method: 'POST' });
    await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { origin: 'https://evil.invalid' } });
    for (const role of [null, 'USER', 'ADMIN']) {
      await fetch(`${base}/api/admin/example`, { method: 'POST', headers: role ? { 'x-test-role': role } : {} });
    }
    let raw = '';
    for (let attempt = 0; attempt < 50; attempt++) {
      raw = await fs.readFile(file, 'utf8').catch(() => '');
      if (raw.trim().split('\n').length === 6) break;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    assert.ok(!raw.includes('NEVER_STORE_SECRET'));
    const events = raw.trim().split('\n').map(JSON.parse);
    assert.equal(events.length, 6, 'health requests must not fill the audit log');
    assert.deepEqual(events.map(event => event.status), [201, 401, 403, 401, 403, 201]);
    assert.equal(events[0].userId, 'admin-id');
    assert.equal(events[0].role, 'ADMIN');
    assert.equal(events[0].ip, '198.51.100.20', 'ignore forged leftmost XFF address');
    assert.equal(events[0].path, '/api/auth/login');
    assert.equal(events[3].action, 'admin.request');
    assert.equal(events[3].userId, null);
    assert.equal(events[4].role, 'USER');
    assert.equal(events[5].outcome, 'success');
    // Reopening after external rotation must create the new path, not keep an
    // open descriptor writing to an old rotated file.
    await fs.rename(file, `${file}.1`);
    await fetch(`${base}/api/auth/login`, { method: 'POST' });
    for (let attempt = 0; attempt < 50; attempt++) {
      if (await fs.readFile(file, 'utf8').catch(() => '')) break;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    assert.equal(JSON.parse((await fs.readFile(file, 'utf8')).trim()).status, 401);
    console.log('Security audit tests passed: actors, guard denials, early rejections, proxy IP, secret exclusion, rotation.');
  } finally {
    await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
