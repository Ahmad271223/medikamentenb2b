import { z } from 'zod';
import { prisma } from '@/lib/db';
import { ApiError, assertSameOrigin, handle, ok, requirePermission } from '@/lib/api';
import { writeAudit } from '@/lib/audit/audit';
import { diffDaysUtc } from '@/domain/dates';

const BatchSchema = z.object({
  productId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  lotNumber: z.string().min(1).max(120),
  manufacturingDate: z.string().date().optional(),
  expiryDate: z.string().date(),
  quantity: z.number().int().positive(),
  unit: z.string().max(30).default('pack'),
  temperatureMode: z.enum(['AMBIENT', 'COLD_2_8', 'FROZEN', 'CONTROLLED_ROOM']).default('AMBIENT'),
  packagingLanguage: z.string().max(50).optional(),
});

export const GET = handle(async () => {
  const user = await requirePermission('org:read');
  if (!user.org) throw new ApiError('NOT_FOUND', 404, 'NO_ORGANIZATION');
  const batches = await prisma.batch.findMany({
    where: { sellerOrgId: user.org.id, deletedAt: null },
    include: { product: true, warehouse: true, position: true },
    orderBy: { expiryDate: 'asc' },
    take: 500,
  });
  return ok(batches);
});

export const POST = handle(async (req) => {
  assertSameOrigin(req);
  const user = await requirePermission('batch:manage');
  if (!user.org) throw new ApiError('NOT_FOUND', 404, 'NO_ORGANIZATION');
  const input = BatchSchema.parse(await req.json());

  const [product, warehouse] = await Promise.all([
    prisma.product.findFirst({ where: { id: input.productId, deletedAt: null } }),
    prisma.warehouse.findFirst({ where: { id: input.warehouseId, orgId: user.org.id, deletedAt: null } }),
  ]);
  if (!product) throw new ApiError('VALIDATION_ERROR', 400, 'UNKNOWN_PRODUCT');
  if (!warehouse) throw new ApiError('VALIDATION_ERROR', 400, 'UNKNOWN_WAREHOUSE');

  const expiryDate = new Date(input.expiryDate);
  const manufacturingDate = input.manufacturingDate ? new Date(input.manufacturingDate) : null;
  if (manufacturingDate && manufacturingDate.getTime() >= expiryDate.getTime()) {
    throw new ApiError('VALIDATION_ERROR', 400, 'MANUFACTURING_AFTER_EXPIRY');
  }

  const duplicate = await prisma.batch.findFirst({
    where: { sellerOrgId: user.org.id, productId: input.productId, lotNumber: input.lotNumber, deletedAt: null },
  });
  if (duplicate) throw new ApiError('CONFLICT', 409, 'DUPLICATE_BATCH');

  const batch = await prisma.$transaction(async (tx) => {
    const batch = await tx.batch.create({
      data: {
        productId: input.productId,
        sellerOrgId: user.org!.id,
        warehouseId: input.warehouseId,
        lotNumber: input.lotNumber,
        manufacturingDate,
        expiryDate,
        originalShelfLifeDays: manufacturingDate ? diffDaysUtc(expiryDate, manufacturingDate) : null,
        quantity: input.quantity,
        unit: input.unit,
        temperatureMode: input.temperatureMode,
        packagingLanguage: input.packagingLanguage,
        position: { create: { onHand: input.quantity } },
      },
    });
    await writeAudit(
      {
        actorUserId: user.id,
        orgId: user.org!.id,
        action: 'BATCH_CREATED',
        entityType: 'Batch',
        entityId: batch.id,
        newValue: { lotNumber: input.lotNumber, expiryDate: input.expiryDate, quantity: input.quantity },
      },
      tx,
    );
    return batch;
  });

  return ok(batch, { status: 201 });
});
