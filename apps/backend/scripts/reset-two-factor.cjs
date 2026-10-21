#!/usr/bin/env node
// Break-glass recovery. Run only through the owner's authenticated VPS shell.
// Never accepts a password, secret, session token or recovery code as arguments.
const { PrismaClient } = require('@prisma/client');
const { appendFile, mkdir } = require('node:fs/promises');
const { dirname, isAbsolute } = require('node:path');

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.length === 0) {
    console.log('Usage: node scripts/reset-two-factor.cjs --user-id USER_ID --confirm-reset-2fa');
    console.log('Disables 2FA for this administrator and revokes ALL sessions. Record saved to SECURITY_AUDIT_FILE.');
    return;
  }
  const index = args.indexOf('--user-id');
  const id = index >= 0 ? args[index + 1] : null;
  if (!id || !/^[A-Za-z0-9_-]{1,100}$/.test(id) || !args.includes('--confirm-reset-2fa') || args.length !== 3) throw new Error('Use --help; explicit user ID and confirmation flag are required');
  const file = process.env.SECURITY_AUDIT_FILE;
  if (!file || !isAbsolute(file)) throw new Error('SECURITY_AUDIT_FILE must be configured');
  const prisma = new PrismaClient();
  const record = outcome => JSON.stringify({ version: 1, time: new Date().toISOString(), action: 'auth.2fa.break_glass_reset', outcome, userId: id, actor: 'vps-owner-cli' }) + '\n';
  try {
    const user = await prisma.user.findUnique({ where: { id }, select: { role: true } });
    if (user?.role !== 'ADMIN') throw new Error('Administrator not found');
    await mkdir(dirname(file), { recursive: true, mode: 0o700 });
    // Fail closed if the operation cannot be audited.
    await appendFile(file, record('started'), { mode: 0o600 });
    await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${id} FOR UPDATE`;
      await tx.twoFactorCredential.deleteMany({ where: { userId: id } });
      await tx.session.deleteMany({ where: { userId: id } });
    });
    await appendFile(file, record('success'), { mode: 0o600 });
    console.log('2FA reset. All sessions revoked. Sign in with your password and enroll a new authenticator.');
  } finally { await prisma.$disconnect(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
