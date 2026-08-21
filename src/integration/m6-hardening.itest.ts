/**
 * M6 hardening acceptance against the real database:
 *  1. Password reset: token round-trip, session revocation, single use,
 *     expired tokens rejected — no user enumeration on request.
 *  2. TOTP MFA: setup → verify enables; wrong code never enables.
 *  3. GDPR: export contains the personal data; anonymization scrubs the
 *     profile, revokes sessions, disables memberships — and never touches
 *     trade records.
 *  4. Invoice numbering comes from the Postgres sequence (strictly increasing).
 *
 * Requires seeded DB; rerun-safe (creates its own throwaway user).
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { createHash, randomBytes } from 'node:crypto';
import { prisma } from '@/lib/db';
import { hashPassword, verifyPassword } from '@/lib/crypto/password';
import { totp } from '@/lib/crypto/totp';
import {
  anonymizeAccount,
  beginMfaSetup,
  confirmMfaSetup,
  exportAccountData,
  requestPasswordReset,
  resetPassword,
} from '@/server/account-service';
import { nextInvoiceNumber } from '@/server/payment-service';

const THROWAWAY_EMAIL = 'm6-throwaway@demo.pharmabridge.local';
let throwawayId: string;

beforeAll(async () => {
  // Fresh throwaway user each run (previous runs anonymized theirs).
  const existing = await prisma.user.findUnique({ where: { email: THROWAWAY_EMAIL } });
  if (existing) {
    await prisma.passwordResetToken.deleteMany({ where: { userId: existing.id } });
    await prisma.user.delete({ where: { id: existing.id } }).catch(() => undefined);
  }
  const user = await prisma.user.create({
    data: {
      email: THROWAWAY_EMAIL,
      passwordHash: await hashPassword('Throwaway-Pass-2026'),
      firstName: 'M6',
      lastName: 'Throwaway [DEMO]',
      locale: 'de',
    },
  });
  throwawayId = user.id;
});

describe('M6 hardening', () => {
  it('1 — password reset: round-trip, single use, session revocation, expiry', async () => {
    // Unknown e-mail: silently succeeds (no enumeration).
    await expect(requestPasswordReset('does-not-exist@nowhere.invalid', 'de')).resolves.toBeUndefined();

    // Live session that must die with the reset.
    await prisma.session.create({
      data: { userId: throwawayId, tokenHash: `m6-${throwawayId}`, expiresAt: new Date(Date.now() + 3600_000) },
    });

    await requestPasswordReset(THROWAWAY_EMAIL, 'de'); // mail goes to the console mailer
    const record = await prisma.passwordResetToken.findFirstOrThrow({
      where: { userId: throwawayId },
      orderBy: { createdAt: 'desc' },
    });

    // The service only stores the hash; forge a known token for the test.
    const rawToken = randomBytes(32).toString('base64url');
    await prisma.passwordResetToken.update({
      where: { id: record.id },
      data: { tokenHash: createHash('sha256').update(rawToken).digest('hex') },
    });

    await expect(resetPassword(rawToken, 'short')).rejects.toMatchObject({ message: 'PASSWORD_POLICY' });
    await resetPassword(rawToken, 'Brand-New-Pass-2026');

    const user = await prisma.user.findUniqueOrThrow({ where: { id: throwawayId } });
    expect(await verifyPassword('Brand-New-Pass-2026', user.passwordHash)).toBe(true);
    expect(await verifyPassword('Throwaway-Pass-2026', user.passwordHash)).toBe(false);

    const openSessions = await prisma.session.count({ where: { userId: throwawayId, revokedAt: null } });
    expect(openSessions).toBe(0);

    // Single use.
    await expect(resetPassword(rawToken, 'Another-Pass-2026x')).rejects.toMatchObject({ message: 'RESET_TOKEN_INVALID' });

    // Expired token.
    const expiredRaw = randomBytes(32).toString('base64url');
    await prisma.passwordResetToken.create({
      data: {
        userId: throwawayId,
        tokenHash: createHash('sha256').update(expiredRaw).digest('hex'),
        expiresAt: new Date(Date.now() - 1000),
      },
    });
    await expect(resetPassword(expiredRaw, 'Yet-Another-2026x')).rejects.toMatchObject({ message: 'RESET_TOKEN_INVALID' });
  });

  it('2 — TOTP MFA: wrong code never enables; correct code does', async () => {
    const setup = await beginMfaSetup(throwawayId, THROWAWAY_EMAIL);
    expect(setup.otpauth).toContain('otpauth://totp/');

    await expect(confirmMfaSetup(throwawayId, '000000')).rejects.toMatchObject({ message: 'MFA_CODE_INVALID' });
    let user = await prisma.user.findUniqueOrThrow({ where: { id: throwawayId } });
    expect(user.mfaEnabled).toBe(false);

    await confirmMfaSetup(throwawayId, totp(setup.secret));
    user = await prisma.user.findUniqueOrThrow({ where: { id: throwawayId } });
    expect(user.mfaEnabled).toBe(true);
  });

  it('3 — GDPR: export delivers the data; anonymization scrubs the profile and spares trade records', async () => {
    const data = await exportAccountData(throwawayId);
    expect(data.user.email).toBe(THROWAWAY_EMAIL);
    expect(Array.isArray(data.auditTrail)).toBe(true);

    const tradeRecordsBefore = await prisma.transaction.count();

    await expect(anonymizeAccount(throwawayId, 'wrong-password')).rejects.toMatchObject({ message: 'PASSWORD_INVALID' });
    await anonymizeAccount(throwawayId, 'Brand-New-Pass-2026');

    const user = await prisma.user.findUniqueOrThrow({ where: { id: throwawayId } });
    expect(user.email).toBe(`deleted-${throwawayId}@anonymized.invalid`);
    expect(user.firstName).toBe('Gelöscht');
    expect(user.status).toBe('DELETED');
    expect(user.mfaEnabled).toBe(false);
    expect(user.mfaSecret).toBeNull();

    expect(await prisma.transaction.count()).toBe(tradeRecordsBefore); // retention split
    expect(await prisma.passwordResetToken.count({ where: { userId: throwawayId } })).toBe(0);

    // Platform accounts cannot self-delete.
    const officer = await prisma.user.findUniqueOrThrow({ where: { email: 'compliance@demo.pharmabridge.local' } });
    await expect(anonymizeAccount(officer.id, 'PharmaBridge-Demo-2026')).rejects.toMatchObject({
      message: 'PLATFORM_ACCOUNT_DELETE_VIA_ADMIN',
    });
  });

  it('4 — invoice numbers come from the Postgres sequence, strictly increasing', async () => {
    const a = await nextInvoiceNumber(prisma);
    const b = await nextInvoiceNumber(prisma);
    expect(a).toMatch(/^PB-\d{4}-\d{5,}$/);
    expect(b).not.toBe(a);
    expect(Number(b.split('-')[2])).toBeGreaterThan(Number(a.split('-')[2]));
  });
});
