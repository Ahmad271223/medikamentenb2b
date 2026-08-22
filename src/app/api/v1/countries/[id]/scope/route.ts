import { NextRequest, NextResponse } from 'next/server';
import { z, ZodError } from 'zod';
import { ApiError, assertSameOrigin, fail, ok, requirePermission } from '@/lib/api';
import { setCountryScope } from '@/server/country-service';

// Platform scope per country: who may register on the supply / destination
// side. A founder/operations decision — it never asserts anything regulatory
// and never makes a country tradable (that stays behind verified rules).
const Schema = z
  .object({
    isSupplyEnabled: z.boolean().optional(),
    isDestinationEnabled: z.boolean().optional(),
  })
  .refine((v) => v.isSupplyEnabled !== undefined || v.isDestinationEnabled !== undefined, {
    message: 'At least one flag required',
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
    return ok(await setCountryScope(user.id, id, input));
  } catch (err) {
    if (err instanceof ApiError) return fail(err);
    if (err instanceof ZodError) return fail(new ApiError('VALIDATION_ERROR', 400, 'Invalid input', err.issues));
    console.error('[api] country scope error', err);
    return fail(new ApiError('INTERNAL', 500, 'Internal error'));
  }
}
