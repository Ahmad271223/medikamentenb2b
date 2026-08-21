import { NextRequest, NextResponse } from 'next/server';
import { z, ZodError } from 'zod';
import { ApiError, assertSameOrigin, fail, ok, requirePermission } from '@/lib/api';
import { inviteBuyerToListing } from '@/server/listing-service';

const Schema = z.object({ buyerOrgId: z.string().uuid() });

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    assertSameOrigin(req);
    const user = await requirePermission('listing:publish');
    if (!user.org) throw new ApiError('NOT_FOUND', 404, 'NO_ORGANIZATION');
    const { id } = await params;
    const input = Schema.parse(await req.json());
    return ok(await inviteBuyerToListing(user, id, input.buyerOrgId), { status: 201 });
  } catch (err) {
    if (err instanceof ApiError) return fail(err);
    if (err instanceof ZodError) return fail(new ApiError('VALIDATION_ERROR', 400, 'Invalid input'));
    console.error('[api] listing invite error', err);
    return fail(new ApiError('INTERNAL', 500, 'Internal error'));
  }
}
