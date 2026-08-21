import { NextRequest, NextResponse } from 'next/server';
import { ApiError, assertSameOrigin, fail, ok, requirePermission } from '@/lib/api';
import { revokeWebhookEndpoint } from '@/server/webhook-service';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    assertSameOrigin(req);
    const user = await requirePermission('member:manage');
    const { id } = await params;
    await revokeWebhookEndpoint(user, id);
    return ok({ revoked: true });
  } catch (err) {
    if (err instanceof ApiError) return fail(err);
    console.error('[api] webhook revoke error', err);
    return fail(new ApiError('INTERNAL', 500, 'Internal error'));
  }
}
