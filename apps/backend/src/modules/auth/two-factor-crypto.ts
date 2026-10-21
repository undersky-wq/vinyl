import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual, scrypt as scryptCallback } from 'node:crypto';
import { promisify } from 'node:util';
import { Secret, TOTP } from 'otpauth';

const scrypt = promisify(scryptCallback);

export async function verifyPasswordHash(password: string, stored: string | null) {
  if (!stored) return false;
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, 'hex');
  const candidate = await scrypt(password, salt, 64) as Buffer;
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

export function encryptSecret(secret: string, key: Buffer, context: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(context));
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('hex'), cipher.getAuthTag().toString('hex'), encrypted.toString('hex')].join(':');
}

export function decryptSecret(value: string, key: Buffer, context: string) {
  const [version, iv, tag, ciphertext] = value.split(':');
  if (version !== 'v1' || !iv || !tag || !ciphertext) throw new Error('Invalid encrypted 2FA credential');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'hex'));
  decipher.setAAD(Buffer.from(context));
  decipher.setAuthTag(Buffer.from(tag, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'hex')), decipher.final()]).toString('utf8');
}

export function newSecret() { return new Secret({ size: 20 }).base32; }
export function totp(secret: string, label = 'Administrator') {
  return new TOTP({ issuer: 'mityadima.ru', label, algorithm: 'SHA1', digits: 6, period: 30, secret: Secret.fromBase32(secret) });
}
export function matchingStep(secret: string, code: string, now = Date.now()) {
  if (!/^\d{6}$/.test(code)) return null;
  const delta = totp(secret).validate({ token: code, timestamp: now, window: 1 });
  return delta === null ? null : Math.floor(now / 30000) + delta;
}
export function recoveryHash(userId: string, code: string) {
  const normalized = code.replace(/[\s-]/g, '').toUpperCase();
  return createHash('sha256').update(`mityadima:recovery:${userId}:${normalized}`).digest('hex');
}
export function newRecoveryCodes() {
  return Array.from({ length: 10 }, () => randomBytes(10).toString('hex').toUpperCase().match(/.{4}/g)!.join('-'));
}
