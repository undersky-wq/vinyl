import { BadRequestException, HttpException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, TwoFactorCredential, User } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import { toDataURL } from 'qrcode';
import { PrismaService } from '../prisma/prisma.service';
import { decryptSecret, encryptSecret, matchingStep, newRecoveryCodes, newSecret, recoveryHash, totp, verifyPasswordHash } from './two-factor-crypto';

type Failure = { error: string; status?: number };
function failure(value: unknown): value is Failure { return !!value && typeof value === 'object' && 'error' in value; }
type Transaction = Prisma.TransactionClient;

@Injectable()
export class TwoFactorService {
  private readonly key: Buffer;
  constructor(private readonly prisma: PrismaService, config: ConfigService) {
    const key = config.get<string>('AUTH_2FA_ENCRYPTION_KEY');
    if (!key || !/^[a-fA-F0-9]{64}$/.test(key)) throw new Error('Configure a 32-byte AUTH_2FA_ENCRYPTION_KEY (64 hex characters)');
    this.key = Buffer.from(key, 'hex');
  }

  private async locked<T>(userId: string, operation: (tx: Transaction, credential: TwoFactorCredential | null) => Promise<T | Failure>) {
    const result = await this.prisma.$transaction(async tx => {
      // Lock the user even before enrollment exists. Login and changes of the
      // second factor serialize with session issuance/revocation on this row.
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
      return operation(tx, await tx.twoFactorCredential.findUnique({ where: { userId } }));
    }, { timeout: 15000 });
    // Throw AFTER commit, otherwise failed-attempt increments would roll back.
    if (failure(result)) throw new HttpException({ message: result.error, code: result.error }, result.status || 401);
    return result as T;
  }

  private context(userId: string, purpose: 'active' | 'pending') { return `mityadima:2fa:${userId}:${purpose}`; }
  private async badCode(tx: Transaction, credential: TwoFactorCredential): Promise<Failure> {
    const attempts = credential.lockedUntil ? 1 : credential.failedAttempts + 1;
    await tx.twoFactorCredential.update({ where: { userId: credential.userId }, data: {
      failedAttempts: attempts, lockedUntil: attempts >= 8 ? new Date(Date.now() + 15 * 60 * 1000) : null,
    } });
    return { error: attempts >= 8 ? 'TWO_FACTOR_LOCKED' : 'TWO_FACTOR_INVALID', status: attempts >= 8 ? 429 : 401 };
  }
  private isLocked(credential: TwoFactorCredential) { return !!credential.lockedUntil && credential.lockedUntil.getTime() > Date.now(); }

  private async consume(tx: Transaction, credential: TwoFactorCredential, code: string): Promise<Failure | null> {
    if (this.isLocked(credential)) return { error: 'TWO_FACTOR_LOCKED', status: 429 };
    if (!credential.secretCiphertext || !credential.enabledAt) return { error: 'TWO_FACTOR_NOT_ENABLED' };
    const normalized = code.replace(/[\s-]/g, '').toUpperCase();
    const hash = recoveryHash(credential.userId, normalized);
    const recoveryIndex = /^[A-F0-9]{20}$/.test(normalized) ? credential.recoveryHashes.indexOf(hash) : -1;
    if (recoveryIndex >= 0) {
      await tx.twoFactorCredential.update({ where: { userId: credential.userId }, data: {
        recoveryHashes: credential.recoveryHashes.filter((_, index) => index !== recoveryIndex), failedAttempts: 0, lockedUntil: null,
      } });
      return null;
    }
    const secret = decryptSecret(credential.secretCiphertext, this.key, this.context(credential.userId, 'active'));
    const step = matchingStep(secret, code.trim());
    if (step === null || (credential.lastUsedStep !== null && step <= credential.lastUsedStep)) return this.badCode(tx, credential);
    await tx.twoFactorCredential.update({ where: { userId: credential.userId }, data: { lastUsedStep: step, failedAttempts: 0, lockedUntil: null } });
    return null;
  }

  private async issueSession(tx: Transaction, userId: string) {
    const token = randomBytes(32).toString('hex');
    await tx.session.create({ data: { userId, tokenHash: createHash('sha256').update(token).digest('hex'), expiresAt: new Date(Date.now() + 30 * 86400000) } });
    return token;
  }
  private async replaceSessions(tx: Transaction, userId: string) {
    await tx.session.deleteMany({ where: { userId } });
    return this.issueSession(tx, userId);
  }

  async login(user: User, code?: string) {
    return this.locked(user.id, async (tx, credential) => {
      const current = await tx.user.findUnique({ where: { id: user.id } });
      if (!current || current.passwordHash !== user.passwordHash) return { error: 'Invalid email or password' };
      if (credential?.enabledAt) {
        if (this.isLocked(credential)) return { error: 'TWO_FACTOR_LOCKED', status: 429 };
        if (!code?.trim()) return { error: 'TWO_FACTOR_REQUIRED' };
        const error = await this.consume(tx, credential, code);
        if (error) return error;
      }
      return { token: await this.issueSession(tx, user.id) };
    });
  }

  async status(userId: string) {
    const value = await this.prisma.twoFactorCredential.findUnique({ where: { userId } });
    return { enabled: !!value?.enabledAt, recoveryCodesRemaining: value?.enabledAt ? value.recoveryHashes.length : 0 };
  }

  private async checkPassword(userId: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !(await verifyPasswordHash(password, user.passwordHash))) throw new UnauthorizedException('Invalid password');
    return user;
  }

  async setup(userId: string, password: string, code?: string) {
    const user = await this.checkPassword(userId, password);
    const secret = newSecret();
    const qrDataUrl = await toDataURL(totp(secret, user.email || user.id).toString(), { width: 256, margin: 2, errorCorrectionLevel: 'M' });
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await this.locked(userId, async (tx, credential) => {
      if (credential?.enabledAt) {
        const error = await this.consume(tx, credential, code || '');
        if (error) return error;
      }
      const data = { pendingCiphertext: encryptSecret(secret, this.key, this.context(userId, 'pending')), pendingExpiresAt: expiresAt };
      await tx.twoFactorCredential.upsert({ where: { userId }, create: { userId, ...data }, update: data });
      return { ok: true };
    });
    return { secret, qrDataUrl, expiresAt: expiresAt.toISOString() };
  }

  async confirm(userId: string, password: string, code: string) {
    await this.checkPassword(userId, password);
    return this.locked(userId, async (tx, credential) => {
      if (!credential?.pendingCiphertext || !credential.pendingExpiresAt || credential.pendingExpiresAt.getTime() <= Date.now()) {
        return { error: 'TWO_FACTOR_SETUP_EXPIRED', status: 400 };
      }
      if (this.isLocked(credential)) return { error: 'TWO_FACTOR_LOCKED', status: 429 };
      const secret = decryptSecret(credential.pendingCiphertext, this.key, this.context(userId, 'pending'));
      const step = matchingStep(secret, code.trim());
      if (step === null) return this.badCode(tx, credential);
      const recoveryCodes = newRecoveryCodes();
      await tx.twoFactorCredential.update({ where: { userId }, data: {
        secretCiphertext: encryptSecret(secret, this.key, this.context(userId, 'active')), enabledAt: new Date(),
        pendingCiphertext: null, pendingExpiresAt: null, lastUsedStep: step,
        recoveryHashes: recoveryCodes.map(value => recoveryHash(userId, value)), failedAttempts: 0, lockedUntil: null,
      } });
      return { recoveryCodes, token: await this.replaceSessions(tx, userId) };
    });
  }

  async change(userId: string, password: string, code: string, action: 'disable' | 'recovery') {
    await this.checkPassword(userId, password);
    return this.locked(userId, async (tx, credential) => {
      if (!credential?.enabledAt) throw new BadRequestException('TWO_FACTOR_NOT_ENABLED');
      const error = await this.consume(tx, credential, code);
      if (error) return error;
      const recoveryCodes = action === 'recovery' ? newRecoveryCodes() : [];
      if (action === 'disable') {
        await tx.twoFactorCredential.delete({ where: { userId } });
      } else {
        await tx.twoFactorCredential.update({ where: { userId }, data: {
          recoveryHashes: recoveryCodes.map(value => recoveryHash(userId, value)),
          pendingCiphertext: null, pendingExpiresAt: null,
        } });
      }
      return { recoveryCodes, token: await this.replaceSessions(tx, userId) };
    });
  }
}
