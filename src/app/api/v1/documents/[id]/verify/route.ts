import { NextRequest, NextResponse } from 'next/server';
import { z, ZodError } from 'zod';
import { prisma } from '@/lib/db';
import { ApiError, assertSameOrigin, fail, ok, requirePermission } from '@/lib/api';
import { writeAudit } from '@/lib/audit/audit';

const Schema = z.object({
  decision: z.enum(['VERIFIED', 'REJECTED']),
  reason: z.string().max(2000).optional(),
});

/** Human document verification — feeds the compliance guard context. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    assertSameOrigin(req);
    const user = await requirePermission('document:verify');
    const { id } = await params;
    const input = Schema.parse(await req.json());

    const document = await prisma.document.findFirst({ where: { id, deletedAt: null } });
    if (!document) throw new ApiError('NOT_FOUND', 404, 'DOCUMENT_NOT_FOUND');

    await prisma.$transaction(async (db) => {
      await db.document.update({ where: { id }, data: { status: input.decision } });
      await writeAudit(
        {
          actorType: 'COMPLIANCE',
          actorUserId: user.id,
          orgId: document.ownerOrgId,
          action: `DOCUMENT_${input.decision}`,
          entityType: 'Document',
          entityId: id,
          oldValue: { status: document.status },
          newValue: { status: input.decision },
          reason: input.reason ?? null,
        },
        db,
      );
    });
    return ok({ status: input.decision });
  } catch (err) {
    if (err instanceof ApiError) return fail(err);
    if (err instanceof ZodError) return fail(new ApiError('VALIDATION_ERROR', 400, 'Invalid input', err.issues));
    console.error('[api] document verify error', err);
    return fail(new ApiError('INTERNAL', 500, 'Internal error'));
  }
}
