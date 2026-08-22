import { z } from 'zod';
import { prisma } from '@/lib/db';
import { ApiError, assertSameOrigin, clientIp, handle, ok } from '@/lib/api';
import { checkPasswordPolicy, hashPassword } from '@/lib/crypto/password';
import { createSession, SESSION_COOKIE, sessionCookieOptions } from '@/lib/auth/session';
import { rateLimit } from '@/lib/auth/rate-limit';
import { writeAudit } from '@/lib/audit/audit';

const RegisterSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email().max(200).transform((v) => v.toLowerCase().trim()),
  password: z.string().min(1).max(200),
  orgName: z.string().min(2).max(300),
  orgKind: z.enum(['SELLER', 'BUYER', 'HYBRID']),
  countryId: z.string().length(2),
  locale: z.enum(['de', 'en', 'ar']).default('de'),
});

export const POST = handle(async (req) => {
  assertSameOrigin(req);
  const ip = clientIp(req);
  if (!rateLimit(`register:${ip}`, 10, 15 * 60_000).allowed) {
    throw new ApiError('RATE_LIMITED', 429, 'Too many attempts');
  }

  const input = RegisterSchema.parse(await req.json());

  const policy = checkPasswordPolicy(input.password);
  if (!policy.ok) {
    throw new ApiError('VALIDATION_ERROR', 400, 'PASSWORD_POLICY', policy.issues);
  }

  const country = await prisma.country.findUnique({ where: { id: input.countryId } });
  if (!country) throw new ApiError('VALIDATION_ERROR', 400, 'UNKNOWN_COUNTRY');
  // Platform scope: sellers only from supply-enabled, buyers only from
  // destination-enabled countries (hybrids need both). Managed in Admin → Countries.
  const inScope =
    input.orgKind === 'SELLER'
      ? country.isSupplyEnabled
      : input.orgKind === 'BUYER'
        ? country.isDestinationEnabled
        : country.isSupplyEnabled && country.isDestinationEnabled;
  if (!inScope) throw new ApiError('VALIDATION_ERROR', 400, 'COUNTRY_NOT_SUPPORTED');

  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw new ApiError('CONFLICT', 409, 'EMAIL_TAKEN');

  const passwordHash = await hashPassword(input.password);

  const { user, org } = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email: input.email,
        passwordHash,
        firstName: input.firstName,
        lastName: input.lastName,
        locale: input.locale,
      },
    });
    const org = await tx.organization.create({
      data: {
        kind: input.orgKind,
        legalName: input.orgName,
        countryId: input.countryId,
        contactEmail: input.email,
        status: 'DRAFT',
      },
    });
    await tx.organizationMember.create({ data: { userId: user.id, orgId: org.id, role: 'OWNER' } });
    await writeAudit(
      { actorUserId: user.id, orgId: org.id, action: 'USER_REGISTERED', entityType: 'User', entityId: user.id },
      tx,
    );
    await writeAudit(
      {
        actorUserId: user.id,
        orgId: org.id,
        action: 'ORG_CREATED',
        entityType: 'Organization',
        entityId: org.id,
        newValue: { legalName: input.orgName, kind: input.orgKind, countryId: input.countryId },
      },
      tx,
    );
    return { user, org };
  });

  const session = await createSession(user.id, { ip, userAgent: req.headers.get('user-agent') });
  const res = ok({ userId: user.id, orgId: org.id });
  res.cookies.set(SESSION_COOKIE, session.token, sessionCookieOptions(session.expiresAt));
  return res;
});
