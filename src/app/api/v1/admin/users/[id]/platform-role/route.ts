import { NextRequest, NextResponse } from 'next/server';
import { z, ZodError } from 'zod';
import { ApiError, assertSameOrigin, fail, ok, requirePermission } from '@/lib/api';
import { setPlatformRole } from '@/server/platform-user-service';

const Schema = z.object({
  platformRole: z.enum(['PLATFORM_ADMIN', 'COMPLIANCE_OFFICER', 'REGULATORY_ANALYST']).nullable(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    assertSameOrigin(req);
    const admin = await requirePermission('user:manage');
    const { id } = await params;
    const input = Schema.parse(await req.json());
    return ok(await setPlatformRole(admin.id, id, input.platformRole));
  } catch (err) {
    if (err instanceof ApiError) return fail(err);
    if (err instanceof ZodError) return fail(new ApiError('VALIDATION_ERROR', 400, 'Invalid input', err.issues));
    console.error('[api] platform-role error', err);
    return fail(new ApiError('INTERNAL', 500, 'Internal error'));
  }
}
