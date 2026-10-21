const assert = require('node:assert/strict');
const { scryptSync, randomBytes } = require('node:crypto');
const { readFile, unlink } = require('node:fs/promises');
const { execFileSync } = require('node:child_process');
const { PrismaClient } = require('@prisma/client');
const { TOTP, Secret } = require('otpauth');
const { TwoFactorService } = require('../dist/modules/auth/two-factor.service.js');
const { AuthService } = require('../dist/modules/auth/auth.service.js');
const { decryptSecret, matchingStep, totp } = require('../dist/modules/auth/two-factor-crypto.js');

async function main() {
  const url = new URL(process.env.DATABASE_URL);
  // Explicit guard: this test must NEVER run against the production database.
  assert.equal(url.pathname, '/vinyl_2fa_test_20261021');
  const prisma = new PrismaClient();
  const key = randomBytes(32).toString('hex');
  const config = { get: name => name === 'AUTH_2FA_ENCRYPTION_KEY' ? key : name === 'NODE_ENV' ? 'production' : undefined };
  const factor = new TwoFactorService(prisma, config);
  const auth = new AuthService(prisma, config, {}, factor);
  const password = 'Isolated-2FA-test-password';
  const salt = randomBytes(16).toString('hex');
  const user = await prisma.user.create({ data: { email: `twofactor-${randomBytes(5).toString('hex')}@example.invalid`, displayName: 'Isolated security test', role: 'ADMIN', passwordHash: `${salt}:${scryptSync(password, salt, 64).toString('hex')}` } });
  let cookie;
  const response = { cookie: (name, value) => { cookie = value; }, clearCookie: () => {} };
  const rejects = async (operation, code) => assert.rejects(operation, error => error.getResponse?.().code === code || error.message === code);
  const tokenFor = secret => totp(secret).generate();
  const invalid = secret => {
    for (let value = 0; value < 100; value++) {
      const code = String(value).padStart(6, '0');
      if (matchingStep(secret, code) === null) return code;
    }
    throw new Error('No invalid fixture token found');
  };
  try {
    // Published RFC 6238 SHA1 test vectors, independently of the six-digit UI.
    for (const [time, expected] of [[59,'94287082'],[1111111109,'07081804'],[1111111111,'14050471'],[1234567890,'89005924'],[2000000000,'69279037'],[20000000000,'65353130']]) {
      const otp = new TOTP({ secret: Secret.fromUTF8('12345678901234567890'), algorithm: 'SHA1', digits: 8, period: 30 });
      assert.equal(otp.generate({ timestamp: time * 1000 }), expected);
    }
    await auth.login({ email: user.email, password }, response);
    const oldCookie = cookie;
    await assert.rejects(factor.setup(user.id, 'wrong-password'), { status: 401 });
    const setup = await factor.setup(user.id, password);
    assert.match(setup.qrDataUrl, /^data:image\/png;base64,/);
    let credential = await prisma.twoFactorCredential.findUnique({ where: { userId: user.id } });
    assert.equal(credential.enabledAt, null);
    assert.ok(!credential.pendingCiphertext.includes(setup.secret));
    assert.throws(() => decryptSecret(credential.pendingCiphertext, Buffer.from(key, 'hex'), 'wrong-user-context'));
    await rejects(factor.confirm(user.id, password, invalid(setup.secret)), 'TWO_FACTOR_INVALID');
    const enabled = await factor.confirm(user.id, password, tokenFor(setup.secret));
    assert.equal(enabled.recoveryCodes.length, 10);
    assert.equal(await auth.getUserFromRequest({ headers: { cookie: `vinyl_session=${oldCookie}` } }), null);
    assert.equal(await prisma.session.count({ where: { userId: user.id } }), 1);
    await rejects(auth.login({ email: user.email, password }, response), 'TWO_FACTOR_REQUIRED');
    await rejects(auth.login({ email: user.email, password, code: tokenFor(setup.secret) }, response), 'TWO_FACTOR_INVALID');
    const firstRecovery = enabled.recoveryCodes[0];
    const concurrent = await Promise.allSettled([factor.login(user, firstRecovery), factor.login(user, firstRecovery)]);
    assert.equal(concurrent.filter(value => value.status === 'fulfilled').length, 1, 'recovery code consumed atomically');
    const nextToken = totp(setup.secret).generate({ timestamp: Date.now() + 30000 });
    const concurrentTotp = await Promise.allSettled([factor.login(user, nextToken), factor.login(user, nextToken)]);
    assert.equal(concurrentTotp.filter(value => value.status === 'fulfilled').length, 1, 'TOTP consumed atomically');
    credential = await prisma.twoFactorCredential.findUnique({ where: { userId: user.id } });
    assert.equal(credential.recoveryHashes.length, 9);
    assert.ok(!JSON.stringify(credential).includes(firstRecovery));
    const regenerated = await factor.change(user.id, password, enabled.recoveryCodes[1], 'recovery');
    assert.equal(regenerated.recoveryCodes.length, 10);
    await rejects(factor.login(user, enabled.recoveryCodes[2]), 'TWO_FACTOR_INVALID');
    assert.equal(await prisma.session.count({ where: { userId: user.id } }), 1);
    await factor.setup(user.id, password, regenerated.recoveryCodes[0]);
    await prisma.twoFactorCredential.update({ where: { userId: user.id }, data: { pendingExpiresAt: new Date(0) } });
    await rejects(factor.confirm(user.id, password, tokenFor(setup.secret)), 'TWO_FACTOR_SETUP_EXPIRED');
    const replacement = await factor.setup(user.id, password, regenerated.recoveryCodes[1]);
    const rotated = await factor.confirm(user.id, password, tokenFor(replacement.secret));
    credential = await prisma.twoFactorCredential.findUnique({ where: { userId: user.id } });
    assert.equal(decryptSecret(credential.secretCiphertext, Buffer.from(key, 'hex'), `mityadima:2fa:${user.id}:active`), replacement.secret);
    await rejects(factor.login(user, regenerated.recoveryCodes[2]), 'TWO_FACTOR_INVALID');
    await assert.rejects(factor.change(user.id, 'wrong-password', rotated.recoveryCodes[0], 'disable'), { status: 401 });
    await factor.change(user.id, password, rotated.recoveryCodes[0], 'disable');
    assert.equal((await factor.status(user.id)).enabled, false);
    await auth.login({ email: user.email, password }, response);
    const lockedSetup = await factor.setup(user.id, password);
    const lockedEnabled = await factor.confirm(user.id, password, tokenFor(lockedSetup.secret));
    for (let attempt = 1; attempt <= 8; attempt++) {
      await rejects(factor.login(user, invalid(lockedSetup.secret)), attempt === 8 ? 'TWO_FACTOR_LOCKED' : 'TWO_FACTOR_INVALID');
    }
    await rejects(factor.login(user, lockedEnabled.recoveryCodes[0]), 'TWO_FACTOR_LOCKED');
    await prisma.twoFactorCredential.update({ where: { userId: user.id }, data: { lockedUntil: new Date(0) } });
    await factor.login(user, lockedEnabled.recoveryCodes[0]);
    assert.ok(!JSON.stringify(auth.toPublicUser(user)).includes('passwordHash'));
    const log = `/tmp/vinyl-2fa-reset-${randomBytes(5).toString('hex')}.jsonl`;
    execFileSync(process.execPath, ['scripts/reset-two-factor.cjs', '--user-id', user.id, '--confirm-reset-2fa'], { env: { ...process.env, SECURITY_AUDIT_FILE: log }, stdio: 'pipe' });
    assert.equal((await factor.status(user.id)).enabled, false);
    assert.equal(await prisma.session.count({ where: { userId: user.id } }), 0);
    assert.match(await readFile(log, 'utf8'), /auth\.2fa\.break_glass_reset/);
    await unlink(log);
    console.log('PASS: RFC vectors, encryption binding, password reauthentication, enrollment, full-session gating, recovery/TOTP races, expiry, phone replacement, revocation, lockout and audited VPS recovery. Isolated PostgreSQL only.');
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.$disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
