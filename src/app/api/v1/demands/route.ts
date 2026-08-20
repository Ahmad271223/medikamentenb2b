import { z } from 'zod';
import { prisma } from '@/lib/db';
import { ApiError, assertSameOrigin, handle, ok, requirePermission } from '@/lib/api';
import { writeAudit } from '@/lib/audit/audit';
import { runMatchingForDemand } from '@/server/matching-service';

const DECIMAL_RE = /^\d{1,12}(\.\d{1,4})?$/;

const DemandSchema = z.object({
  productId: z.string().uuid().optional(),
  productFreeText: z.string().max(300).optional(),
  strengthText: z.string().max(100).optional(),
  dosageFormText: z.string().max(100).optional(),
  quantity: z.number().int().positive(),
  requiredBy: z.string().date().optional(),
  maxUnitPrice: z.string().regex(DECIMAL_RE).optional(),
  minRemainingShelfLifeMonths: z.number().int().positive().max(60).optional(),
  coldChainRequired: z.boolean().default(false),
  monthlyConsumptionUnits: z.number().int().positive().optional(),
}).refine((v) => v.productId || v.productFreeText, { message: 'productId or productFreeText required' });

export const GET = handle(async () => {
  const user = await requirePermission('org:read');
  if (!user.org) throw new ApiError('NOT_FOUND', 404, 'NO_ORGANIZATION');
  const demands = await prisma.buyerDemand.findMany({
    where: { buyerOrgId: user.org.id },
    include: { product: true, destinationCountry: true, _count: { select: { matches: true } } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  return ok(demands);
});

export const POST = handle(async (req) => {
  assertSameOrigin(req);
  const user = await requirePermission('demand:manage');
  if (!user.org) throw new ApiError('NOT_FOUND', 404, 'NO_ORGANIZATION');
  const input = DemandSchema.parse(await req.json());

  if (input.productId) {
    const product = await prisma.product.findFirst({ where: { id: input.productId, deletedAt: null } });
    if (!product) throw new ApiError('VALIDATION_ERROR', 400, 'UNKNOWN_PRODUCT');
  }
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: user.org.id } });

  const demand = await prisma.buyerDemand.create({
    data: {
      buyerOrgId: org.id,
      productId: input.productId ?? null,
      productFreeText: input.productFreeText ?? null,
      strengthText: input.strengthText ?? null,
      dosageFormText: input.dosageFormText ?? null,
      quantity: input.quantity,
      destinationCountryId: org.countryId,
      requiredBy: input.requiredBy ? new Date(input.requiredBy) : null,
      maxUnitPrice: input.maxUnitPrice ?? null,
      minRemainingShelfLifeMonths: input.minRemainingShelfLifeMonths ?? null,
      coldChainRequired: input.coldChainRequired,
      monthlyConsumptionUnits: input.monthlyConsumptionUnits ?? null,
      isDemo: org.isDemo,
    },
  });
  await writeAudit({
    actorUserId: user.id,
    orgId: org.id,
    action: 'DEMAND_CREATED',
    entityType: 'BuyerDemand',
    entityId: demand.id,
    newValue: { quantity: input.quantity, productId: input.productId ?? input.productFreeText },
  });

  const matches = await runMatchingForDemand(demand.id);
  return ok({ demandId: demand.id, matchesCreated: matches }, { status: 201 });
});
