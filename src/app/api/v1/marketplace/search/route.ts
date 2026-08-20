import { z } from 'zod';
import { ApiError, handle, ok, requirePermission } from '@/lib/api';
import { searchMarketplace } from '@/server/marketplace-service';

const SearchSchema = z.object({
  q: z.string().max(200).optional(),
  listingType: z.enum(['SURPLUS', 'SHORT_DATED']).optional(),
  maxUnitPrice: z.coerce.number().positive().optional(),
  minShelfMonths: z.coerce.number().int().positive().optional(),
});

/** Marketplace visibility is ELIGIBILITY-FILTERED — see marketplace-service. */
export const GET = handle(async (req) => {
  const user = await requirePermission('org:read');
  if (!user.org) throw new ApiError('NOT_FOUND', 404, 'NO_ORGANIZATION');
  const params = SearchSchema.parse(Object.fromEntries(req.nextUrl.searchParams));
  return ok(await searchMarketplace(user.org.id, params));
});
