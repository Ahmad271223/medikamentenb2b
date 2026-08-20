import { z } from 'zod';
import { assertSameOrigin, handle, ok, requirePermission } from '@/lib/api';
import { recordSanctionsCheck } from '@/server/sanctions-service';

const CheckSchema = z.object({
  orgId: z.string().uuid(),
  result: z.enum(['CLEAR', 'REVIEW', 'BLOCKED']),
  note: z.string().max(2000).optional(),
  expiresAt: z.string().date().optional(),
});

export const POST = handle(async (req) => {
  assertSameOrigin(req);
  const user = await requirePermission('review:decide');
  const input = CheckSchema.parse(await req.json());
  const result = await recordSanctionsCheck(user.id, input);
  return ok(result, { status: 201 });
});
