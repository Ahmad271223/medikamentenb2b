import { z } from 'zod';
import { ApiError, assertSameOrigin, handle, ok, requirePermission } from '@/lib/api';
import { createShipment } from '@/server/shipment-service';

const ShipmentSchema = z.object({
  transactionId: z.string().uuid(),
  carrier: z.string().min(2).max(200),
  service: z.string().max(200).optional(),
  pickupDate: z.string().date().optional(),
  estimatedArrival: z.string().date(),
  trackingNumber: z.string().max(120).optional(),
  airwayBill: z.string().max(120).optional(),
});

export const POST = handle(async (req) => {
  assertSameOrigin(req);
  const user = await requirePermission('batch:manage');
  if (!user.org) throw new ApiError('NOT_FOUND', 404, 'NO_ORGANIZATION');
  const input = ShipmentSchema.parse(await req.json());
  return ok(await createShipment(user.id, user.org.id, input), { status: 201 });
});
