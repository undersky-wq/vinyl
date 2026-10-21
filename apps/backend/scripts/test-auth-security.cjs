const assert = require('node:assert/strict');
const { scryptSync } = require('node:crypto');
require('ts-node').register({ transpileOnly: true });
const { AuthService } = require('../src/modules/auth/auth.service.ts');
const { AuthGuard, AdminGuard } = require('../src/modules/auth/auth.guards.ts');
const { TwoFactorService } = require('../src/modules/auth/two-factor.service.ts');

async function main() {
  const password = 'Only-a-local-test-password';
  const user = { id: 'test-user', email: 'test@example.invalid', role: 'USER', displayName: 'Test',
    passwordHash: `test-salt:${scryptSync(password, 'test-salt', 64).toString('hex')}` };
  let session;
  const prisma = {
    user: { findUnique: async ({ where }) => where.email === user.email || where.id === user.id ? user : null },
    twoFactorCredential: { findUnique: async () => null },
    $queryRaw: async () => [],
    session: {
      create: async ({ data }) => { session = { ...data, id: 'test-session', user }; },
      findUnique: async ({ where }) => session?.tokenHash === where.tokenHash ? session : null,
      deleteMany: async () => { session = null; },
      delete: async () => { session = null; },
    },
  };
  prisma.$transaction = async callback => callback(prisma);
  const config = { get: key => key === 'NODE_ENV' ? 'production' : key === 'AUTH_2FA_ENCRYPTION_KEY' ? 'ab'.repeat(32) : undefined };
  const service = new AuthService(prisma, config, {}, new TwoFactorService(prisma, config));
  let cookie;
  const response = { cookie: (name, value, options) => { cookie = { name, value, options }; }, clearCookie: () => {} };
  await assert.rejects(service.login({ email: user.email, password: 'wrong' }, response), { status: 401 });
  const publicUser = await service.login({ email: user.email.toUpperCase(), password }, response);
  assert.equal(publicUser.passwordHash, undefined);
  assert.equal(cookie.options.httpOnly, true);
  assert.equal(cookie.options.secure, true);
  assert.equal(cookie.options.sameSite, 'lax');
  assert.notEqual(session.tokenHash, cookie.value);
  const request = { headers: { cookie: `${cookie.name}=${cookie.value}` } };
  assert.equal((await service.me(request)).id, user.id);
  assert.equal(await service.me({ headers: { cookie: 'vinyl_session=forged' } }), null);
  const context = { switchToHttp: () => ({ getRequest: () => request }) };
  assert.equal(await new AuthGuard(service).canActivate(context), true);
  await assert.rejects(new AdminGuard(service).canActivate(context), { status: 403 });
  session.user = { ...user, role: 'ADMIN' };
  assert.equal(await new AdminGuard(service).canActivate(context), true);
  session.expiresAt = new Date(0);
  assert.equal(await service.me(request), null);
  await service.login({ email: user.email, password }, response);
  request.headers.cookie = `${cookie.name}=${cookie.value}`;
  await service.logout(request, response);
  assert.equal(await service.me(request), null);
  console.log('PASS: password verification, session cookie protections, token hashing, role isolation, session expiration and logout (in-memory fixtures only)');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
