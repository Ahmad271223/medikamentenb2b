import { z } from 'zod';
import { prisma } from '@/lib/db';
import { assertSameOrigin, handle, ok, requirePermission } from '@/lib/api';
import { createRecall } from '@/server/recall-service';

const RecallSchema = z.object({
  batchIds: z.array(z.string().uuid()).min(1).max(200),
  scope: z.string().min(3).max(500),
  sourceName: z.string().max(300).optional(),
  sourceUrl: z.string().url().max(1000).optional(),
  notes: z.string().max(4000).optional(),
});

export const GET = handle(async () => {
  await requirePermission('review:decide');
  const recalls = await prisma.recall.findMany({
    include: {
      product: { select: { inn: true } },
      affectedBatches: { include: { batch: { select: { lotNumber: true } } } },
    },
    orderBy: { issuedAt: 'desc' },
    take: 100,
  });
  return ok(recalls);
});

export const POST = handle(async (req) => {
  assertSameOrigin(req);
  const user = await requirePermission('review:decide');
  const input = RecallSchema.parse(await req.json());
  const result = await createRecall(user.id, input);
  return ok(result, { status: 201 });
});
