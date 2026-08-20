import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { ApiError, assertSameOrigin, fail, ok, requirePermission } from '@/lib/api';
import { withdrawListing } from '@/server/listing-service';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    assertSameOrigin(req);
    const user = await requirePermission('listing:publish');
    const { id } = await params;
    await withdrawListing(user, id);
    return ok({ withdrawn: true });
  } catch (err) {
    if (err instanceof ApiError) return fail(err);
    if (err instanceof ZodError) return fail(new ApiError('VALIDATION_ERROR', 400, 'Invalid input'));
    console.error('[api] listing withdraw error', err);
    return fail(new ApiError('INTERNAL', 500, 'Internal error'));
  }
}
