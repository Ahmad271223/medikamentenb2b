import { NextRequest, NextResponse } from 'next/server';
import { z, ZodError } from 'zod';
import { ApiError, assertSameOrigin, fail, ok, requireUser } from '@/lib/api';
import { hasPermission } from '@/lib/authz/permissions';
import { toActor } from '@/lib/auth/current';
import { listMessages, postMessage } from '@/server/chat-service';

const MessageSchema = z.object({ body: z.string().min(1).max(4000) });

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const user = await requireUser();
    const { id } = await params;
    const isPlatform = hasPermission(toActor(user), 'review:decide');
    return ok(await listMessages(user.org?.id ?? null, isPlatform, id));
  } catch (err) {
    if (err instanceof ApiError) return fail(err);
    console.error('[api] messages list error', err);
    return fail(new ApiError('INTERNAL', 500, 'Internal error'));
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    assertSameOrigin(req);
    const user = await requireUser();
    const { id } = await params;
    const input = MessageSchema.parse(await req.json());
    const isPlatform = hasPermission(toActor(user), 'review:decide');
    const result = await postMessage({ id: user.id, orgId: user.org?.id ?? null, isPlatform }, id, input.body);
    return ok(result, { status: 201 });
  } catch (err) {
    if (err instanceof ApiError) return fail(err);
    if (err instanceof ZodError) return fail(new ApiError('VALIDATION_ERROR', 400, 'Invalid input'));
    console.error('[api] message post error', err);
    return fail(new ApiError('INTERNAL', 500, 'Internal error'));
  }
}
