import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { ApiError, assertSameOrigin, fail, ok, requirePermission } from '@/lib/api';
import { publishRuleVersion } from '@/server/rule-service';

// Publishing turns a drafted rule version into the verified current version.
// This is the human verification act (rule:verify-publish — Compliance
// Officer / Platform Admin; a Regulatory Analyst cannot reach this).
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    assertSameOrigin(req);
    const user = await requirePermission('rule:verify-publish');
    const { id } = await params;
    const result = await publishRuleVersion(user.id, id);
    return ok(result);
  } catch (err) {
    if (err instanceof ApiError) return fail(err);
    if (err instanceof ZodError) return fail(new ApiError('VALIDATION_ERROR', 400, 'Invalid input'));
    console.error('[api] rule publish error', err);
    return fail(new ApiError('INTERNAL', 500, 'Internal error'));
  }
}
