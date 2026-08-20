import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

// Password hashing with node:crypto scrypt — zero native dependencies,
// OWASP-aligned parameters (N=2^15, r=8, p=1, 64-byte key). Argon2id is the
// documented production upgrade path; the format prefix keeps hashes
// self-describing so algorithms can coexist during migration.

const SCRYPT_N = 2 ** 15;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 64;
const MAX_MEM = 64 * 1024 * 1024;

function scryptAsync(password: string, salt: Buffer, N: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_LENGTH, { N, r, p, maxmem: MAX_MEM }, (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, SCRYPT_N, SCRYPT_R, SCRYPT_P);
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, nStr, rStr, pStr, saltB64, keyB64] = parts;
  const N = Number(nStr);
  const r = Number(rStr);
  const p = Number(pStr);
  if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) return false;
  const salt = Buffer.from(saltB64, 'base64');
  const expected = Buffer.from(keyB64, 'base64');
  const actual = await scryptAsync(password, salt, N, r, p);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export interface PasswordPolicyResult {
  ok: boolean;
  issues: string[];
}

/** Minimum policy: 12+ characters with basic variety. Codes are i18n keys. */
export function checkPasswordPolicy(password: string): PasswordPolicyResult {
  const issues: string[] = [];
  if (password.length < 12) issues.push('password.tooShort');
  if (!/[a-zA-Z]/.test(password)) issues.push('password.needsLetter');
  if (!/[0-9]/.test(password)) issues.push('password.needsDigit');
  if (password.length > 200) issues.push('password.tooLong');
  return { ok: issues.length === 0, issues };
}
