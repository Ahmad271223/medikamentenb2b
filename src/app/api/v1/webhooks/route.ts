import { z } from 'zod';
import { prisma } from '@/lib/db';
import { ApiError, assertSameOrigin, handle, ok, requirePermission } from '@/lib/api';
import { createWebhookEndpoint, WEBHOOK_EVENTS } from '@/server/webhook-service';

const CreateSchema = z.object({
  url: z.string().url().max(1000).refine((u) => u.startsWith('https://') || u.startsWith('http://localhost') || u.startsWith('http://127.0.0.1'), {
    message: 'https required (localhost allowed for development)',
  }),
  events: z.array(z.enum(WEBHOOK_EVENTS)).min(1),
});

export const GET = handle(async () => {
  const user = await requirePermission('member:manage');
  if (!user.org) throw new ApiError('NOT_FOUND', 404, 'NO_ORGANIZATION');
  const endpoints = await prisma.webhookEndpoint.findMany({
    where: { orgId: user.org.id },
    select: {
      id: true, url: true, events: true, active: true, createdAt: true, revokedAt: true,
      deliveries: { orderBy: { createdAt: 'desc' }, take: 5, select: { event: true, status: true, responseCode: true, createdAt: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  return ok(endpoints);
});

export const POST = handle(async (req) => {
  assertSameOrigin(req);
  const user = await requirePermission('member:manage');
  const input = CreateSchema.parse(await req.json());
  return ok(await createWebhookEndpoint(user, input.url, input.events), { status: 201 });
});
