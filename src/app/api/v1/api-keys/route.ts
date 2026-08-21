import { z } from 'zod';
import { prisma } from '@/lib/db';
import { ApiError, assertSameOrigin, handle, ok, requirePermission } from '@/lib/api';
import { createApiKey } from '@/server/api-key-service';

const CreateSchema = z.object({
  name: z.string().min(2).max(100),
  role: z.enum(['COMMERCIAL', 'INVENTORY', 'VIEWER']),
});

export const GET = handle(async () => {
  const user = await requirePermission('member:manage');
  if (!user.org) throw new ApiError('NOT_FOUND', 404, 'NO_ORGANIZATION');
  const keys = await prisma.apiKey.findMany({
    where: { orgId: user.org.id },
    select: { id: true, name: true, prefix: true, role: true, lastUsedAt: true, revokedAt: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });
  return ok(keys);
});

export const POST = handle(async (req) => {
  assertSameOrigin(req);
  const user = await requirePermission('member:manage');
  const input = CreateSchema.parse(await req.json());
  return ok(await createApiKey(user, input.name, input.role), { status: 201 });
});
