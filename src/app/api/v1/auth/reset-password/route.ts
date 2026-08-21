import { z } from 'zod';
import { ApiError, assertSameOrigin, clientIp, handle, ok } from '@/lib/api';
import { rateLimit } from '@/lib/auth/rate-limit';
import { resetPassword } from '@/server/account-service';

const Schema = z.object({
  token: z.string().min(20).max(200),
  password: z.string().min(1).max(200),
});

export const POST = handle(async (req) => {
  assertSameOrigin(req);
  const ip = clientIp(req);
  if (!rateLimit(`reset:${ip}`, 10, 15 * 60_000).allowed) {
    throw new ApiError('RATE_LIMITED', 429, 'Too many attempts');
  }
  const input = Schema.parse(await req.json());
  await resetPassword(input.token, input.password);
  return ok({ reset: true });
});
