import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { getCurrentUser, toActor, type CurrentUser } from '@/lib/auth/current';
import { hasPermission, type Permission, type PermissionScope } from '@/lib/authz/permissions';
import { env } from '@/lib/env';

// Consistent REST envelope (docs/architecture/API-DESIGN.md):
//   { ok: true, data }  |  { ok: false, error: { code, message, details? } }

import { ApiError } from '@/lib/errors';
export { ApiError };

export function ok<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json({ ok: true, data }, init);
}

export function fail(error: ApiError): NextResponse {
  return NextResponse.json(
    { ok: false, error: { code: error.code, message: error.message, details: error.details } },
    { status: error.status },
  );
}

export function handle(fn: (req: NextRequest) => Promise<NextResponse>) {
  return async (req: NextRequest): Promise<NextResponse> => {
    try {
      return await fn(req);
    } catch (err) {
      if (err instanceof ApiError) return fail(err);
      if (err instanceof ZodError) {
        return fail(new ApiError('VALIDATION_ERROR', 400, 'Invalid input', err.issues));
      }
      console.error('[api] unhandled error', err);
      return fail(new ApiError('INTERNAL', 500, 'Internal error'));
    }
  };
}

/** CSRF defense-in-depth: mutating requests must originate from our own app. */
export function assertSameOrigin(req: NextRequest): void {
  const origin = req.headers.get('origin');
  if (!origin) return; // non-browser clients (no Origin header) rely on cookie absence
  const allowed = new URL(env().APP_URL).origin;
  const host = req.headers.get('host');
  const sameHost = host && origin === `${new URL(origin).protocol}//${host}`;
  if (origin !== allowed && !sameHost) {
    throw new ApiError('FORBIDDEN', 403, 'Cross-origin request rejected');
  }
}

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new ApiError('UNAUTHENTICATED', 401, 'Sign-in required');
  return user;
}

/**
 * Server-side authorization for every protected route. Returns the user when
 * the permission holds in the given scope; throws 403 otherwise.
 */
export async function requirePermission(permission: Permission, scope: PermissionScope = {}): Promise<CurrentUser> {
  const user = await requireUser();
  const effectiveScope = scope.orgId === undefined && user.org ? { orgId: user.org.id } : scope;
  if (!hasPermission(toActor(user), permission, effectiveScope)) {
    throw new ApiError('FORBIDDEN', 403, 'Missing permission', { permission });
  }
  return user;
}

export function clientIp(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
}
