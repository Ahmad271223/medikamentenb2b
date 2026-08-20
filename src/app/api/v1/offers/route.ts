import { z } from 'zod';
import { ApiError, assertSameOrigin, handle, ok, requirePermission } from '@/lib/api';
import { submitOffer } from '@/server/offer-service';

const DECIMAL_RE = /^\d{1,12}(\.\d{1,4})?$/;

const OfferSchema = z.object({
  listingId: z.string().uuid(),
  quantity: z.number().int().positive(),
  unitPrice: z.string().regex(DECIMAL_RE, 'invalid decimal'),
  incoterm: z.string().max(10).optional(),
  requestedDeliveryDate: z.string().date().optional(),
  conditions: z.string().max(2000).optional(),
});

export const POST = handle(async (req) => {
  assertSameOrigin(req);
  const user = await requirePermission('offer:submit');
  if (!user.org) throw new ApiError('NOT_FOUND', 404, 'NO_ORGANIZATION');
  const input = OfferSchema.parse(await req.json());
  const result = await submitOffer(user, input);
  return ok(result, { status: 201 });
});
