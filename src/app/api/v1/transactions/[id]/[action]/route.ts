import { NextRequest, NextResponse } from 'next/server';
import { z, ZodError } from 'zod';
import { ApiError, assertSameOrigin, fail, ok, requirePermission } from '@/lib/api';
import { authorizePayment } from '@/server/payment-service';
import { confirmReceipt, openDispute, requestDocuments, resolveDispute, resubmitForReview } from '@/server/transaction-service';

const NoteSchema = z.object({ note: z.string().min(3).max(2000) });
const ResolveSchema = z.object({
  outcome: z.enum(['SETTLED', 'REJECTED']),
  note: z.string().min(3).max(2000),
});

// Per-action authorization: each branch resolves its own permission before the
// service enforces party/state constraints on top.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; action: string }> },
): Promise<NextResponse> {
  try {
    assertSameOrigin(req);
    const { id, action } = await params;

    switch (action) {
      case 'request-documents': {
        const user = await requirePermission('transaction:compliance-approve');
        const { note } = NoteSchema.parse(await req.json());
        return ok(await requestDocuments(user.id, id, note));
      }
      case 'resubmit': {
        const user = await requirePermission('document:upload');
        if (!user.org) throw new ApiError('NOT_FOUND', 404, 'NO_ORGANIZATION');
        return ok(await resubmitForReview(user.id, user.org.id, id));
      }
      case 'authorize-payment': {
        // Financial act of the buying organization (OWNER/ADMIN/FINANCE).
        const user = await requirePermission('payment:read');
        if (!user.org) throw new ApiError('NOT_FOUND', 404, 'NO_ORGANIZATION');
        return ok(await authorizePayment(user.id, user.org.id, id));
      }
      case 'confirm-receipt': {
        // Commercial act of the buying organization (OWNER/ADMIN/COMMERCIAL).
        const user = await requirePermission('offer:accept');
        if (!user.org) throw new ApiError('NOT_FOUND', 404, 'NO_ORGANIZATION');
        return ok(await confirmReceipt(user.id, user.org.id, id));
      }
      case 'dispute': {
        // Commercial act of either party after delivery.
        const user = await requirePermission('offer:accept');
        if (!user.org) throw new ApiError('NOT_FOUND', 404, 'NO_ORGANIZATION');
        const { note } = NoteSchema.parse(await req.json());
        return ok(await openDispute(user.id, user.org.id, id, note));
      }
      case 'resolve-dispute': {
        const user = await requirePermission('transaction:compliance-approve');
        const input = ResolveSchema.parse(await req.json());
        return ok(await resolveDispute(user.id, id, input.outcome, input.note));
      }
      default:
        throw new ApiError('NOT_FOUND', 404, 'UNKNOWN_ACTION');
    }
  } catch (err) {
    if (err instanceof ApiError) return fail(err);
    if (err instanceof ZodError) return fail(new ApiError('VALIDATION_ERROR', 400, 'Invalid input', err.issues));
    console.error('[api] transaction action error', err);
    return fail(new ApiError('INTERNAL', 500, 'Internal error'));
  }
}
