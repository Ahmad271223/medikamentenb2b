import { z } from 'zod';
import { prisma } from '@/lib/db';
import { ApiError, assertSameOrigin, handle, ok, requirePermission } from '@/lib/api';
import { writeAudit } from '@/lib/audit/audit';

const ProductSchema = z.object({
  inn: z.string().min(2).max(200),
  brandName: z.string().max(200).optional(),
  atcCode: z.string().max(10).optional(),
  strengthValue: z.number().positive().optional(),
  strengthUnit: z.string().max(20).optional(),
  dosageForm: z.string().min(2).max(100),
  routeOfAdministration: z.string().max(100).optional(),
  packSize: z.number().int().positive().optional(),
  packUnit: z.string().max(30).optional(),
  prescriptionStatus: z.enum(['RX', 'OTC', 'UNKNOWN']).default('UNKNOWN'),
  controlledStatus: z.enum(['NONE', 'NARCOTIC', 'PSYCHOTROPIC', 'OTHER_CONTROLLED', 'UNKNOWN']).default('UNKNOWN'),
  coldChain: z.boolean().default(false),
  originalShelfLifeMonths: z.number().int().positive().max(120).optional(),
});

export const GET = handle(async () => {
  const user = await requirePermission('org:read');
  const products = await prisma.product.findMany({
    where: { deletedAt: null, ...(user.platformRole ? {} : { OR: [{ status: 'VERIFIED' }, { proposedByOrgId: user.org?.id }] }) },
    orderBy: { inn: 'asc' },
    take: 200,
  });
  return ok(products);
});

export const POST = handle(async (req) => {
  assertSameOrigin(req);
  const user = await requirePermission('product:propose');
  if (!user.org) throw new ApiError('NOT_FOUND', 404, 'NO_ORGANIZATION');
  const input = ProductSchema.parse(await req.json());

  const product = await prisma.$transaction(async (tx) => {
    const product = await tx.product.create({
      data: {
        ...input,
        status: 'PENDING_REVIEW',
        proposedByOrgId: user.org!.id,
      },
    });
    await tx.complianceReview.create({
      data: { type: 'PRODUCT', orgId: user.org!.id, productId: product.id, priority: 40 },
    });
    await writeAudit(
      {
        actorUserId: user.id,
        orgId: user.org!.id,
        action: 'PRODUCT_PROPOSED',
        entityType: 'Product',
        entityId: product.id,
        newValue: { inn: input.inn, dosageForm: input.dosageForm },
      },
      tx,
    );
    return product;
  });

  return ok(product, { status: 201 });
});
