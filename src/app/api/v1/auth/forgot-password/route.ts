import { z } from 'zod';
import { ApiError, assertSameOrigin, clientIp, handle, ok } from '@/lib/api';
import { rateLimit } from '@/lib/auth/rate-limit';
import { requestPasswordReset } from '@/server/account-service';

const Schema = z.object({
  email: z.string().email().max(200),
  locale: z.enum(['de', 'en', 'ar']).default('de'),
});

// Always returns ok — whether the account exists is never revealed.
export const POST = handle(async (req) => {
  assertSameOrigin(req);
  const ip = clientIp(req);
  if (!rateLimit(`forgot:${ip}`, 5, 15 * 60_000).allowed) {
    throw new ApiError('RATE_LIMITED', 429, 'Too many attempts');
  }
  const input = Schema.parse(await req.json());
  await requestPasswordReset(input.email, input.locale);
  return ok({ sent: true });
});
