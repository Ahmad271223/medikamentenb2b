import { NextRequest, NextResponse } from 'next/server';
import { z, ZodError } from 'zod';
import { prisma } from '@/lib/db';
import { ApiError, assertSameOrigin, fail, ok, requireUser } from '@/lib/api';
import { hasPermission } from '@/lib/authz/permissions';
import { toActor } from '@/lib/auth/current';
import { dispatchShipment, recordShipmentEvent, recordTemperature } from '@/server/shipment-service';

const EventSchema = z.object({
  type: z.enum(['PICKED_UP', 'CUSTOMS_IN', 'CUSTOMS_CLEARED', 'DELIVERED', 'EXCEPTION']),
  location: z.string().max(200).optional(),
  occurredAt: z.string().datetime().optional(),
});
const TemperatureSchema = z.object({
  temperatureC: z.number().min(-80).max(80),
  recordedAt: z.string().datetime().optional(),
  source: z.string().max(120).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; action: string }> },
): Promise<NextResponse> {
  try {
    assertSameOrigin(req);
    const { id, action } = await params;
    const user = await requireUser();
    const actor = toActor(user);

    const shipment = await prisma.shipment.findUnique({ where: { id }, include: { transaction: true } });
    if (!shipment) throw new ApiError('NOT_FOUND', 404, 'SHIPMENT_NOT_FOUND');

    // Milestones may be recorded by the seller's logistics-capable roles or by
    // platform compliance/admin; dispatch is the seller's act alone.
    const isSellerSide =
      user.org?.id === shipment.transaction.sellerOrgId &&
      hasPermission(actor, 'batch:manage', { orgId: user.org.id });
    const isPlatform = hasPermission(actor, 'review:decide');

    switch (action) {
      case 'dispatch': {
        if (!isSellerSide) throw new ApiError('FORBIDDEN', 403, 'NOT_SELLER');
        return ok(await dispatchShipment(user.id, user.org!.id, id));
      }
      case 'events': {
        if (!isSellerSide && !isPlatform) throw new ApiError('FORBIDDEN', 403, 'FORBIDDEN');
        const input = EventSchema.parse(await req.json());
        return ok(await recordShipmentEvent(user.id, id, input));
      }
      case 'temperature': {
        if (!isSellerSide && !isPlatform) throw new ApiError('FORBIDDEN', 403, 'FORBIDDEN');
        const input = TemperatureSchema.parse(await req.json());
        return ok(await recordTemperature(user.id, id, input));
      }
      default:
        throw new ApiError('NOT_FOUND', 404, 'UNKNOWN_ACTION');
    }
  } catch (err) {
    if (err instanceof ApiError) return fail(err);
    if (err instanceof ZodError) return fail(new ApiError('VALIDATION_ERROR', 400, 'Invalid input', err.issues));
    console.error('[api] shipment action error', err);
    return fail(new ApiError('INTERNAL', 500, 'Internal error'));
  }
}
