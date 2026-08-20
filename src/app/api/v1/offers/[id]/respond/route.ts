import { NextRequest, NextResponse } from 'next/server';
import { z, ZodError } from 'zod';
import { ApiError, assertSameOrigin, fail, ok, requirePermission } from '@/lib/api';
import { respondToOffer } from '@/server/offer-service';

const DECIMAL_RE = /^\d{1,12}(\.\d{1,4})?$/;

const RespondSchema = z.object({
  action: z.enum(['ACCEPT', 'REJECT', 'COUNTER']),
  reason: z.string().max(2000).optional(),
  counter: z
    .object({
      quantity: z.number().int().positive(),
      unitPrice: z.string().regex(DECIMAL_RE),
      conditions: z.string().max(2000).optional(),
    })
    .optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    assertSameOrigin(req);
    // Accepting/rejecting/countering are commercial acts of the counterparty org.
    const user = await requirePermission('offer:accept');
    const { id } = await params;
    const input = RespondSchema.parse(await req.json());
    const result = await respondToOffer(user, id, input);
    return ok(result);
  } catch (err) {
    if (err instanceof ApiError) return fail(err);
    if (err instanceof ZodError) return fail(new ApiError('VALIDATION_ERROR', 400, 'Invalid input', err.issues));
    console.error('[api] offer respond error', err);
    return fail(new ApiError('INTERNAL', 500, 'Internal error'));
  }
}
