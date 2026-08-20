import { cookies } from 'next/headers';
import { handle, ok } from '@/lib/api';
import { revokeSession, SESSION_COOKIE } from '@/lib/auth/session';

export const POST = handle(async () => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await revokeSession(token);
  const res = ok({ signedOut: true });
  res.cookies.set(SESSION_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
  return res;
});
