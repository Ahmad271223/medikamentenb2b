import { z } from 'zod';
import { prisma } from '@/lib/db';
import { ApiError, assertSameOrigin, clientIp, handle, ok } from '@/lib/api';
import { verifyPassword } from '@/lib/crypto/password';
import { verifyTotp } from '@/lib/crypto/totp';
import { createSession, SESSION_COOKIE, sessionCookieOptions } from '@/lib/auth/session';
import { rateLimit } from '@/lib/auth/rate-limit';
import { writeAudit } from '@/lib/audit/audit';

const LoginSchema = z.object({
  email: z.string().email().max(200).transform((v) => v.toLowerCase().trim()),
  password: z.string().min(1).max(200),
  /** Required when the account has MFA enabled. */
  totp: z.string().length(6).optional(),
});

export const POST = handle(async (req) => {
  assertSameOrigin(req);
  const ip = clientIp(req);
  const input = LoginSchema.parse(await req.json());

  if (
    !rateLimit(`login:${ip}:${input.email}`, 5, 15 * 60_000).allowed ||
    !rateLimit(`login-ip:${ip}`, 30, 15 * 60_000).allowed
  ) {
    throw new ApiError('RATE_LIMITED', 429, 'Too many attempts');
  }

  const user = await prisma.user.findUnique({ where: { email: input.email } });
  // Constant-shape failure: never reveal whether the account exists.
  if (!user || user.status !== 'ACTIVE' || !(await verifyPassword(input.password, user.passwordHash))) {
    throw new ApiError('UNAUTHENTICATED', 401, 'INVALID_CREDENTIALS');
  }

  // MFA gate — only after the password is proven correct.
  if (user.mfaEnabled && user.mfaSecret) {
    if (!input.totp) throw new ApiError('UNAUTHENTICATED', 401, 'MFA_REQUIRED');
    if (!verifyTotp(user.mfaSecret, input.totp)) {
      throw new ApiError('UNAUTHENTICATED', 401, 'MFA_INVALID');
    }
  }

  const session = await createSession(user.id, { ip, userAgent: req.headers.get('user-agent') });
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await writeAudit({ actorUserId: user.id, action: 'USER_LOGIN', entityType: 'User', entityId: user.id, ip });

  const res = ok({ userId: user.id });
  res.cookies.set(SESSION_COOKIE, session.token, sessionCookieOptions(session.expiresAt));
  return res;
});
