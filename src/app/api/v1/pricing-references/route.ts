import { z } from 'zod';
import { prisma } from '@/lib/db';
import { ApiError, assertSameOrigin, handle, ok, requirePermission } from '@/lib/api';
import { writeAudit } from '@/lib/audit/audit';

const DECIMAL_RE = /^\d{1,12}(\.\d{1,4})?$/;

// Sourced pricing references (spec §17): a reference without a named source
// cannot exist — "insufficient pricing data" beats an invented number.
const RefSchema = z.object({
  productId: z.string().uuid(),
  countryId: z.string().length(2).optional(),
  priceType: z.enum(['WHOLESALE_REF', 'PROCUREMENT', 'TENDER']),
  price: z.string().regex(DECIMAL_RE),
  currency: z.enum(['EUR', 'USD', 'CHF', 'GBP']).default('EUR'),
  sourceName: z.string().min(3).max(300),
  sourceUrl: z.string().url().max(1000).optional(),
  asOf: z.string().date(),
  confidence: z.enum(['HIGH', 'MEDIUM', 'LOW', 'UNVERIFIED']).default('UNVERIFIED'),
});

export const GET = handle(async () => {
  await requirePermission('rule:draft');
  const refs = await prisma.pricingReference.findMany({
    include: { product: { select: { inn: true } }, country: { select: { nameEn: true } } },
    orderBy: { asOf: 'desc' },
    take: 200,
  });
  return ok(refs);
});

export const POST = handle(async (req) => {
  assertSameOrigin(req);
  const user = await requirePermission('rule:draft');
  const input = RefSchema.parse(await req.json());

  const product = await prisma.product.findFirst({ where: { id: input.productId, deletedAt: null } });
  if (!product) throw new ApiError('VALIDATION_ERROR', 400, 'UNKNOWN_PRODUCT');
  if (input.countryId) {
    const country = await prisma.country.findUnique({ where: { id: input.countryId } });
    if (!country) throw new ApiError('VALIDATION_ERROR', 400, 'UNKNOWN_COUNTRY');
  }

  const ref = await prisma.pricingReference.create({
    data: {
      productId: input.productId,
      countryId: input.countryId ?? null,
      priceType: input.priceType,
      price: input.price,
      currency: input.currency,
      sourceName: input.sourceName,
      sourceUrl: input.sourceUrl ?? null,
      asOf: new Date(input.asOf),
      confidence: input.confidence,
    },
  });
  await writeAudit({
    actorUserId: user.id,
    action: 'PRICING_REFERENCE_ADDED',
    entityType: 'PricingReference',
    entityId: ref.id,
    newValue: { productId: input.productId, price: input.price, sourceName: input.sourceName },
  });
  return ok(ref, { status: 201 });
});
