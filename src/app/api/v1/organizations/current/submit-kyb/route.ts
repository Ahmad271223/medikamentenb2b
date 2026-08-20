import { prisma } from '@/lib/db';
import { ApiError, assertSameOrigin, handle, ok, requirePermission } from '@/lib/api';
import { writeAudit } from '@/lib/audit/audit';

export const POST = handle(async (req) => {
  assertSameOrigin(req);
  const user = await requirePermission('org:update');
  if (!user.org) throw new ApiError('NOT_FOUND', 404, 'NO_ORGANIZATION');

  const org = await prisma.organization.findUniqueOrThrow({ where: { id: user.org.id } });
  if (org.status !== 'DRAFT' && org.status !== 'REJECTED') {
    throw new ApiError('CONFLICT', 409, 'KYB_ALREADY_SUBMITTED');
  }

  await prisma.$transaction(async (tx) => {
    await tx.organization.update({
      where: { id: org.id },
      data: { status: 'PENDING_KYB', kybStatus: 'PENDING' },
    });
    await tx.complianceReview.create({
      data: { type: 'KYB', orgId: org.id, priority: 60 },
    });
    await writeAudit(
      {
        actorUserId: user.id,
        orgId: org.id,
        action: 'KYB_SUBMITTED',
        entityType: 'Organization',
        entityId: org.id,
        oldValue: { status: org.status },
        newValue: { status: 'PENDING_KYB' },
      },
      tx,
    );
  });

  return ok({ status: 'PENDING_KYB' });
});
