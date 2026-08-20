import { describe, expect, it } from 'vitest';
import { checkPasswordPolicy, hashPassword, verifyPassword } from './password';

describe('password hashing (scrypt)', () => {
  it('round-trips a correct password', async () => {
    const hash = await hashPassword('correct horse battery staple 9');
    expect(hash.startsWith('scrypt$')).toBe(true);
    expect(await verifyPassword('correct horse battery staple 9', hash)).toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hash = await hashPassword('correct horse battery staple 9');
    expect(await verifyPassword('wrong horse', hash)).toBe(false);
  });

  it('produces unique salts', async () => {
    const a = await hashPassword('same password 123456');
    const b = await hashPassword('same password 123456');
    expect(a).not.toBe(b);
  });

  it('rejects tampered or malformed hashes without throwing', async () => {
    expect(await verifyPassword('x', 'not-a-hash')).toBe(false);
    expect(await verifyPassword('x', 'scrypt$bad$8$1$AAAA$BBBB')).toBe(false);
  });
});

describe('password policy', () => {
  it('requires 12+ chars with letters and digits', () => {
    expect(checkPasswordPolicy('short1').ok).toBe(false);
    expect(checkPasswordPolicy('onlylettershere').ok).toBe(false);
    expect(checkPasswordPolicy('123456789012').ok).toBe(false);
    expect(checkPasswordPolicy('a-long-passphrase-42').ok).toBe(true);
  });
});
