import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { ApiError, assertSameOrigin, fail, ok, requirePermission } from '@/lib/api';
import { computeCountryReadiness } from '@/server/country-service';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    assertSameOrigin(req);
    const user = await requirePermission('rule:draft');
    const { id } = await params;
    const result = await computeCountryReadiness(user.id, id);
    return ok(result);
  } catch (err) {
    if (err instanceof ApiError) return fail(err);
    if (err instanceof ZodError) return fail(new ApiError('VALIDATION_ERROR', 400, 'Invalid input'));
    console.error('[api] country readiness error', err);
    return fail(new ApiError('INTERNAL', 500, 'Internal error'));
  }
}
