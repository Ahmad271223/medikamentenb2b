import { createHash, randomBytes } from 'node:crypto';
import { prisma } from '@/lib/db';
import { ApiError } from '@/lib/errors';
import { writeAudit } from '@/lib/audit/audit';
import { rateLimit } from '@/lib/auth/rate-limit';
import type { CurrentUser } from '@/lib/auth/current';
import type { OrgRole } from '@/lib/authz/permissions';

// Organization API keys (spec §38/§80): machine access for ERP integrations.
// Format pbk_<8-char prefix>_<secret>; only the SHA-256 of the full token is
// stored, the plaintext is shown exactly once at creation. Key requests are
// attributed to the creating user in the audit trail, with the key id as
// session metadata.

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

// A key must never exceed its creator's own privilege tier.
const CREATABLE_ROLES: readonly OrgRole[] = ['COMMERCIAL', 'INVENTORY', 'VIEWER'];

export async function createApiKey(user: CurrentUser, name: string, role: OrgRole) {
  if (!user.org) throw new ApiError('NOT_FOUND', 404, 'NO_ORGANIZATION');
  if (!CREATABLE_ROLES.includes(role)) throw new ApiError('VALIDATION_ERROR', 400, 'ROLE_NOT_ALLOWED_FOR_KEYS');

  const prefix = randomBytes(6).toString('base64url').slice(0, 8);
  const secret = randomBytes(32).toString('base64url');
  const token = `pbk_${prefix}_${secret}`;

  const key = await prisma.apiKey.create({
    data: {
      orgId: user.org.id,
      name,
      prefix,
      keyHash: sha256(token),
      role,
      createdById: user.id,
    },
  });
  await writeAudit({
    actorUserId: user.id,
    orgId: user.org.id,
    action: 'API_KEY_CREATED',
    entityType: 'ApiKey',
    entityId: key.id,
    newValue: { name, role, prefix },
  });
  // The only moment the plaintext token exists outside the caller's hands.
  return { id: key.id, name, role, prefix, token };
}

export async function revokeApiKey(user: CurrentUser, keyId: string) {
  if (!user.org) throw new ApiError('NOT_FOUND', 404, 'NO_ORGANIZATION');
  const key = await prisma.apiKey.findFirst({ where: { id: keyId, orgId: user.org.id, revokedAt: null } });
  if (!key) throw new ApiError('NOT_FOUND', 404, 'API_KEY_NOT_FOUND');
  await prisma.apiKey.update({ where: { id: key.id }, data: { revokedAt: new Date() } });
  await writeAudit({
    actorUserId: user.id,
    orgId: user.org.id,
    action: 'API_KEY_REVOKED',
    entityType: 'ApiKey',
    entityId: key.id,
  });
}

/**
 * Resolves a Bearer token into the same CurrentUser shape sessions produce, so
 * every route's permission check works identically for humans and machines.
 * Returns null for anything that is not a valid, active key.
 */
export async function resolveApiKey(bearerToken: string): Promise<CurrentUser | null> {
  if (!bearerToken.startsWith('pbk_')) return null;

  const key = await prisma.apiKey.findUnique({
    where: { keyHash: sha256(bearerToken) },
    include: { org: true, createdBy: true },
  });
  if (!key || key.revokedAt) return null;
  if (key.org.status === 'SUSPENDED' || key.org.deletedAt) return null;

  // Per-key rate limit — machine clients get a generous but bounded budget.
  if (!rateLimit(`apikey:${key.id}`, 300, 60_000).allowed) {
    throw new ApiError('RATE_LIMITED', 429, 'API_KEY_RATE_LIMITED');
  }

  await prisma.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } });

  return {
    id: key.createdById,
    email: key.createdBy.email,
    firstName: `API:${key.name}`,
    lastName: key.prefix,
    locale: 'en',
    platformRole: null,
    org: {
      id: key.org.id,
      kind: key.org.kind,
      legalName: key.org.legalName,
      status: key.org.status,
      isDemo: key.org.isDemo,
    },
    orgRole: key.role,
  };
}
