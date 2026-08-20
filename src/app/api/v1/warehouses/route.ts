import { z } from 'zod';
import { prisma } from '@/lib/db';
import { ApiError, assertSameOrigin, handle, ok, requirePermission } from '@/lib/api';
import { writeAudit } from '@/lib/audit/audit';

const WarehouseSchema = z.object({
  name: z.string().min(1).max(200),
  city: z.string().max(120).optional(),
  countryId: z.string().length(2),
  capAmbient: z.boolean().default(true),
  capCold2to8: z.boolean().default(false),
  capFrozen: z.boolean().default(false),
  capControlledRoom: z.boolean().default(false),
  gdpCompliant: z.boolean().default(false),
});

export const GET = handle(async () => {
  const user = await requirePermission('org:read');
  if (!user.org) throw new ApiError('NOT_FOUND', 404, 'NO_ORGANIZATION');
  return ok(await prisma.warehouse.findMany({ where: { orgId: user.org.id, deletedAt: null } }));
});

export const POST = handle(async (req) => {
  assertSameOrigin(req);
  const user = await requirePermission('warehouse:manage');
  if (!user.org) throw new ApiError('NOT_FOUND', 404, 'NO_ORGANIZATION');
  const input = WarehouseSchema.parse(await req.json());

  const country = await prisma.country.findUnique({ where: { id: input.countryId } });
  if (!country) throw new ApiError('VALIDATION_ERROR', 400, 'UNKNOWN_COUNTRY');

  const warehouse = await prisma.warehouse.create({ data: { ...input, orgId: user.org.id } });
  await writeAudit({
    actorUserId: user.id,
    orgId: user.org.id,
    action: 'WAREHOUSE_CREATED',
    entityType: 'Warehouse',
    entityId: warehouse.id,
    newValue: input,
  });
  return ok(warehouse, { status: 201 });
});
