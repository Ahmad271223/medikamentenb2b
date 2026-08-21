import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

// TOTP (RFC 6238) on top of HOTP (RFC 4226) — zero dependencies, verified
// against the RFC test vectors in totp.test.ts. Used for MFA on privileged
// accounts; secrets are stored server-side only.

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    value = (value << 5) | BASE32_ALPHABET.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** HOTP (RFC 4226): HMAC-SHA1 + dynamic truncation → n digits. */
export function hotp(key: Buffer, counter: number, digits = 6): string {
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac('sha1', key).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const code =
    (((hmac[offset]! & 0x7f) << 24) |
      ((hmac[offset + 1]! & 0xff) << 16) |
      ((hmac[offset + 2]! & 0xff) << 8) |
      (hmac[offset + 3]! & 0xff)) %
    10 ** digits;
  return String(code).padStart(digits, '0');
}

export function totp(secretBase32: string, atMs: number = Date.now(), stepSeconds = 30): string {
  const counter = Math.floor(atMs / 1000 / stepSeconds);
  return hotp(base32Decode(secretBase32), counter);
}

/** Accepts the current step ±1 to absorb clock drift. Constant-time compare. */
export function verifyTotp(secretBase32: string, code: string, atMs: number = Date.now()): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  const key = base32Decode(secretBase32);
  const counter = Math.floor(atMs / 1000 / 30);
  for (const drift of [-1, 0, 1]) {
    const expected = hotp(key, counter + drift);
    if (
      expected.length === code.length &&
      timingSafeEqual(Buffer.from(expected), Buffer.from(code))
    ) {
      return true;
    }
  }
  return false;
}

export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function otpauthUrl(accountLabel: string, secretBase32: string, issuer: string): string {
  const label = encodeURIComponent(`${issuer}:${accountLabel}`);
  return `otpauth://totp/${label}?secret=${secretBase32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}
