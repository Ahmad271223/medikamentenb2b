import { createHash, randomBytes } from 'node:crypto';
import { prisma } from '@/lib/db';
import { ApiError } from '@/lib/errors';
import { writeAudit } from '@/lib/audit/audit';
import { checkPasswordPolicy, hashPassword, verifyPassword } from '@/lib/crypto/password';
import { generateTotpSecret, otpauthUrl, verifyTotp } from '@/lib/crypto/totp';
import { getMailer } from '@/lib/email/mailer';
import { env } from '@/lib/env';
import { BRAND } from '@/lib/branding';

const RESET_TTL_MS = 30 * 60 * 1000; // 30 minutes
const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

// ── Password reset ────────────────────────────────────────────────────────

/**
 * Always succeeds from the caller's perspective (no user enumeration).
 * The token travels only via e-mail; only its hash is stored.
 */
export async function requestPasswordReset(email: string, locale: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
  if (!user || user.status !== 'ACTIVE') return;

  const token = randomBytes(32).toString('base64url');
  await prisma.passwordResetToken.create({
    data: { userId: user.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + RESET_TTL_MS) },
  });
  await writeAudit({
    actorUserId: user.id,
    action: 'PASSWORD_RESET_REQUESTED',
    entityType: 'User',
    entityId: user.id,
  });

  const link = `${env().APP_URL}/${locale}/reset-password?token=${token}`;
  await getMailer().send({
    to: user.email,
    subject: `${BRAND.name}: Passwort zurücksetzen / Reset your password`,
    text:
      `Passwort zurücksetzen (30 Minuten gültig) / Reset your password (valid 30 minutes):\n\n${link}\n\n` +
      `Falls Sie das nicht angefordert haben, ignorieren Sie diese E-Mail. / If you did not request this, ignore this e-mail.`,
  });
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const policy = checkPasswordPolicy(newPassword);
  if (!policy.ok) throw new ApiError('VALIDATION_ERROR', 400, 'PASSWORD_POLICY', policy.issues);

  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: true },
  });
  if (!record || record.usedAt || record.expiresAt.getTime() < Date.now() || record.user.status !== 'ACTIVE') {
    throw new ApiError('FORBIDDEN', 403, 'RESET_TOKEN_INVALID');
  }

  const passwordHash = await hashPassword(newPassword);
  await prisma.$transaction(async (tx) => {
    await tx.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } });
    await tx.user.update({ where: { id: record.userId }, data: { passwordHash } });
    // Every existing session dies with the old password.
    await tx.session.updateMany({
      where: { userId: record.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await writeAudit(
      { actorUserId: record.userId, action: 'PASSWORD_RESET_COMPLETED', entityType: 'User', entityId: record.userId },
      tx,
    );
  });
}

// ── TOTP MFA ──────────────────────────────────────────────────────────────

export async function beginMfaSetup(userId: string, email: string) {
  const secret = generateTotpSecret();
  await prisma.user.update({ where: { id: userId }, data: { mfaSecret: secret, mfaEnabled: false } });
  return { secret, otpauth: otpauthUrl(email, secret, BRAND.name) };
}

export async function confirmMfaSetup(userId: string, code: string): Promise<void> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!user.mfaSecret) throw new ApiError('CONFLICT', 409, 'MFA_SETUP_NOT_STARTED');
  if (!verifyTotp(user.mfaSecret, code)) throw new ApiError('FORBIDDEN', 403, 'MFA_CODE_INVALID');
  await prisma.user.update({ where: { id: userId }, data: { mfaEnabled: true } });
  await writeAudit({ actorUserId: userId, action: 'MFA_ENABLED', entityType: 'User', entityId: userId });
}

export async function disableMfa(userId: string, code: string): Promise<void> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!user.mfaEnabled || !user.mfaSecret) return;
  if (!verifyTotp(user.mfaSecret, code)) throw new ApiError('FORBIDDEN', 403, 'MFA_CODE_INVALID');
  await prisma.user.update({ where: { id: userId }, data: { mfaEnabled: false, mfaSecret: null } });
  await writeAudit({ actorUserId: userId, action: 'MFA_DISABLED', entityType: 'User', entityId: userId });
}

// ── GDPR: data access & account anonymization ─────────────────────────────

/** Data-subject access: everything personal we hold about this user. */
export async function exportAccountData(userId: string) {
  const [user, memberships, notifications, auditEntries, messages] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true, email: true, firstName: true, lastName: true, locale: true,
        platformRole: true, status: true, mfaEnabled: true, lastLoginAt: true, createdAt: true,
      },
    }),
    prisma.organizationMember.findMany({
      where: { userId },
      select: { role: true, status: true, createdAt: true, org: { select: { legalName: true, countryId: true } } },
    }),
    prisma.notification.findMany({
      where: { userId },
      select: { type: true, title: true, body: true, createdAt: true, readAt: true },
      orderBy: { createdAt: 'desc' },
      take: 500,
    }),
    prisma.auditLog.findMany({
      where: { actorUserId: userId },
      select: { action: true, entityType: true, entityId: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 1000,
    }),
    prisma.dealMessage.findMany({
      where: { authorUserId: userId },
      select: { body: true, createdAt: true, transactionId: true },
      orderBy: { createdAt: 'desc' },
      take: 500,
    }),
  ]);
  await writeAudit({ actorUserId: userId, action: 'DSAR_EXPORT', entityType: 'User', entityId: userId });
  return {
    exportedAt: new Date().toISOString(),
    note:
      'Personal data export (GDPR Art. 15). Regulated trade records are retained under pharmaceutical/commercial law and reference this account in anonymized form after deletion.',
    user,
    memberships,
    notifications,
    auditTrail: auditEntries,
    dealMessages: messages,
  };
}

/**
 * GDPR deletion (Art. 17) with legal-retention split: the personal profile is
 * anonymized and access revoked; regulated trade records (transactions,
 * batches, audit, compliance decisions) remain, now pointing at an
 * anonymized user row.
 */
export async function anonymizeAccount(userId: string, password: string): Promise<void> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.platformRole) throw new ApiError('FORBIDDEN', 403, 'PLATFORM_ACCOUNT_DELETE_VIA_ADMIN');
  if (!(await verifyPassword(password, user.passwordHash))) {
    throw new ApiError('FORBIDDEN', 403, 'PASSWORD_INVALID');
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: {
        email: `deleted-${userId}@anonymized.invalid`,
        firstName: 'Gelöscht',
        lastName: 'Gelöscht',
        passwordHash: `deleted$${randomBytes(24).toString('base64url')}`,
        mfaEnabled: false,
        mfaSecret: null,
        status: 'DELETED',
        deletedAt: new Date(),
      },
    });
    await tx.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
    await tx.passwordResetToken.deleteMany({ where: { userId } });
    await tx.notification.deleteMany({ where: { userId } });
    await tx.organizationMember.updateMany({ where: { userId }, data: { status: 'DISABLED' } });
    await writeAudit(
      {
        actorUserId: userId,
        action: 'ACCOUNT_ANONYMIZED',
        entityType: 'User',
        entityId: userId,
        reason: 'GDPR Art. 17 request; trade records retained per legal obligation',
      },
      tx,
    );
  });
}
