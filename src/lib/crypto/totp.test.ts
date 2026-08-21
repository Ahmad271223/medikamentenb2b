import { describe, expect, it } from 'vitest';
import { base32Decode, base32Encode, hotp, totp, verifyTotp } from './totp';

// RFC 4226 appendix D test vectors — secret "12345678901234567890".
const RFC_KEY = Buffer.from('12345678901234567890', 'ascii');
const RFC_HOTP = ['755224', '287082', '359152', '969429', '338314', '254676', '287922', '162583', '399871', '520489'];

describe('hotp (RFC 4226 vectors)', () => {
  it.each(RFC_HOTP.map((code, counter) => [counter, code]))('counter %i → %s', (counter, code) => {
    expect(hotp(RFC_KEY, counter as number)).toBe(code);
  });
});

describe('base32 round-trip', () => {
  it('encodes and decodes losslessly', () => {
    const buf = Buffer.from('Hello TOTP secret!', 'utf8');
    expect(base32Decode(base32Encode(buf)).equals(buf)).toBe(true);
  });
});

describe('totp / verifyTotp (RFC 6238, SHA-1, 30s step)', () => {
  const secret = base32Encode(RFC_KEY);
  it('RFC 6238 vector: T=59s → 94287082 (last 6: 287082)', () => {
    expect(totp(secret, 59_000)).toBe('287082');
  });
  it('accepts current and adjacent steps, rejects others', () => {
    const at = 59_000;
    expect(verifyTotp(secret, totp(secret, at), at)).toBe(true);
    expect(verifyTotp(secret, totp(secret, at - 30_000), at)).toBe(true); // drift −1
    expect(verifyTotp(secret, totp(secret, at + 90_000), at)).toBe(false); // too far
    expect(verifyTotp(secret, '000000', at)).toBe(false);
    expect(verifyTotp(secret, 'abcdef', at)).toBe(false);
  });
});
