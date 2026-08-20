import { cache } from 'react';
import { cookies } from 'next/headers';
import { getSessionWithUser, SESSION_COOKIE } from '@/lib/auth/session';
import type { Actor, OrgRole, PlatformRole } from '@/lib/authz/permissions';

export interface CurrentUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  locale: string;
  platformRole: PlatformRole | null;
  org: {
    id: string;
    kind: 'SELLER' | 'BUYER' | 'HYBRID' | 'LOGISTICS';
    legalName: string;
    status: 'DRAFT' | 'PENDING_KYB' | 'VERIFIED' | 'REJECTED' | 'SUSPENDED';
    isDemo: boolean;
  } | null;
  orgRole: OrgRole | null;
}

/**
 * Authoritative server-side identity resolution (per request, cached).
 * The middleware only checks cookie presence; this is the real check.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await getSessionWithUser(token);
  if (!session) return null;

  const membership = session.user.memberships[0] ?? null;
  return {
    id: session.user.id,
    email: session.user.email,
    firstName: session.user.firstName,
    lastName: session.user.lastName,
    locale: session.user.locale,
    platformRole: (session.user.platformRole as PlatformRole | null) ?? null,
    org: membership
      ? {
          id: membership.org.id,
          kind: membership.org.kind,
          legalName: membership.org.legalName,
          status: membership.org.status,
          isDemo: membership.org.isDemo,
        }
      : null,
    orgRole: (membership?.role as OrgRole | undefined) ?? null,
  };
});

export function toActor(user: CurrentUser): Actor {
  return {
    userId: user.id,
    platformRole: user.platformRole,
    orgId: user.org?.id ?? null,
    orgRole: user.orgRole,
  };
}
