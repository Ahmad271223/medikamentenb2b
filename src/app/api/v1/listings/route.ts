import { z } from 'zod';
import { prisma } from '@/lib/db';
import { ApiError, assertSameOrigin, handle, ok, requirePermission } from '@/lib/api';
import { createListing } from '@/server/listing-service';

const DECIMAL_RE = /^\d{1,12}(\.\d{1,4})?$/;

const ListingSchema = z.object({
  batchId: z.string().uuid(),
  quantity: z.number().int().positive(),
  minOrderQuantity: z.number().int().positive().default(1),
  unitPrice: z.string().regex(DECIMAL_RE, 'invalid decimal'),
  currency: z.enum(['EUR', 'USD', 'CHF', 'GBP']).default('EUR'),
  negotiable: z.boolean().default(true),
  incoterm: z.string().max(10).optional(),
  visibility: z.enum(['PUBLIC_VERIFIED', 'COUNTRY_RESTRICTED', 'INVITE_ONLY', 'PRIVATE']).default('PUBLIC_VERIFIED'),
  restrictedToCountryIds: z.array(z.string().length(2)).max(100).default([]),
  anonymousSeller: z.boolean().default(false),
});

export const GET = handle(async () => {
  const user = await requirePermission('org:read');
  if (!user.org) throw new ApiError('NOT_FOUND', 404, 'NO_ORGANIZATION');
  const listings = await prisma.listing.findMany({
    where: { sellerOrgId: user.org.id, deletedAt: null },
    include: { product: true, batch: true },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  return ok(listings);
});

export const POST = handle(async (req) => {
  assertSameOrigin(req);
  const user = await requirePermission('listing:create');
  if (!user.org) throw new ApiError('NOT_FOUND', 404, 'NO_ORGANIZATION');
  const input = ListingSchema.parse(await req.json());
  const result = await createListing(user, input);
  return ok(result, { status: 201 });
});
