import { NextRequest, NextResponse } from 'next/server';
import { z, ZodError } from 'zod';
import { ApiError, assertSameOrigin, fail, ok, requirePermission } from '@/lib/api';
import { setCountryTradeStatus } from '@/server/country-service';

const Schema = z.object({
  tradeStatus: z.enum(['NOT_TRADE_ENABLED', 'RESEARCH_IN_PROGRESS', 'TRADE_ENABLED', 'SUSPENDED']),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    assertSameOrigin(req);
    const user = await requirePermission('country:trade-enable');
    const { id } = await params;
    const input = Schema.parse(await req.json());
    const result = await setCountryTradeStatus(user.id, id, input.tradeStatus);
    return ok(result);
  } catch (err) {
    if (err instanceof ApiError) return fail(err);
    if (err instanceof ZodError) return fail(new ApiError('VALIDATION_ERROR', 400, 'Invalid input', err.issues));
    console.error('[api] country trade-status error', err);
    return fail(new ApiError('INTERNAL', 500, 'Internal error'));
  }
}
