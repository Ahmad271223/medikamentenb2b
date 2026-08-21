import { z } from 'zod';
import { assertSameOrigin, handle, ok, requireUser } from '@/lib/api';
import { anonymizeAccount } from '@/server/account-service';
import { SESSION_COOKIE } from '@/lib/auth/cookie';

const Schema = z.object({ password: z.string().min(1).max(200) });

/** GDPR Art. 17 — anonymizes the profile; regulated trade records remain. */
export const POST = handle(async (req) => {
  assertSameOrigin(req);
  const user = await requireUser();
  const input = Schema.parse(await req.json());
  await anonymizeAccount(user.id, input.password);
  const res = ok({ anonymized: true });
  res.cookies.set(SESSION_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
  return res;
});
