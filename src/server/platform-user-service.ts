import { randomBytes } from 'node:crypto';
import type { PlatformRole } from '@prisma/client';
import { prisma } from '@/lib/db';
import { ApiError } from '@/lib/errors';
import { writeAudit } from '@/lib/audit/audit';
import { checkPasswordPolicy, hashPassword } from '@/lib/crypto/password';
import { requestPasswordReset } from './account-service';

// Platform staff management (PLATFORM_ADMIN, permission `user:manage`).
//
// Staff accounts (Compliance Officer, Regulatory Analyst, further Admins) are
// created here — never through public registration, which always creates a
// trading organization. Separation of duties is enforced structurally: a user
// who is a member of a trading organization can never hold a platform role,
// and an admin cannot remove their own admin role (lock-out protection).

export interface CreatePlatformUserInput {
  email: string;
  firstName: string;
  lastName: string;
  platformRole: PlatformRole;
  locale: 'de' | 'en' | 'ar';
}

/** Policy-compliant random one-time password, shown to the admin exactly once. */
export function generateTemporaryPassword(): string {
  for (let i = 0; i < 10; i++) {
    const candidate = `PB-${randomBytes(15).toString('base64url')}7`;
    if (checkPasswordPolicy(candidate).ok) return candidate;
  }
  throw new Error('Could not generate a policy-compliant password');
}

export async function createPlatformUser(adminUserId: string, input: CreatePlatformUserInput) {
  const email = input.email.toLowerCase().trim();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new ApiError('CONFLICT', 409, 'EMAIL_TAKEN');

  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        email,
        passwordHash,
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim(),
        locale: input.locale,
        platformRole: input.platformRole,
      },
    });
    await writeAudit(
      {
        actorUserId: adminUserId,
        action: 'PLATFORM_USER_CREATED',
        entityType: 'User',
        entityId: created.id,
        newValue: { email, platformRole: input.platformRole },
      },
      tx,
    );
    return created;
  });

  // Best effort: also send a set-your-password link (console mailer in dev).
  // The one-time password returned below is the guaranteed hand-over path.
  try {
    await requestPasswordReset(email, input.locale);
  } catch (err) {
    console.warn('[platform-user] welcome reset mail failed', err);
  }

  return { id: user.id, email: user.email, platformRole: user.platformRole, temporaryPassword };
}

export async function setPlatformRole(adminUserId: string, userId: string, platformRole: PlatformRole | null) {
  const user = await prisma.user.findUnique({ where: { id: userId }, include: { memberships: { select: { id: true } } } });
  if (!user || user.deletedAt) throw new ApiError('NOT_FOUND', 404, 'USER_NOT_FOUND');
  if (userId === adminUserId && platformRole !== 'PLATFORM_ADMIN') {
    throw new ApiError('CONFLICT', 409, 'CANNOT_DEMOTE_SELF');
  }
  if (platformRole && user.memberships.length > 0) {
    throw new ApiError('CONFLICT', 409, 'ORG_MEMBER_CANNOT_BE_STAFF');
  }
  if (user.platformRole === platformRole) return { platformRole };

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { platformRole } });
    await writeAudit(
      {
        actorUserId: adminUserId,
        action: 'PLATFORM_ROLE_CHANGED',
        entityType: 'User',
        entityId: userId,
        oldValue: { platformRole: user.platformRole },
        newValue: { platformRole },
      },
      tx,
    );
  });
  return { platformRole };
}
