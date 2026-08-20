// Edge-safe session cookie constants — imported by the middleware, which runs
// in the Edge runtime and must not pull in node:crypto or Prisma.

export const SESSION_COOKIE = 'pb_session';

export function sessionCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: expiresAt,
  };
}
