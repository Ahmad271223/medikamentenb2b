import { prisma } from '@/lib/db';
import { ApiError, handle, ok, requirePermission } from '@/lib/api';

export const GET = handle(async () => {
  const user = await requirePermission('transaction:read');
  if (!user.org) throw new ApiError('NOT_FOUND', 404, 'NO_ORGANIZATION');
  const negotiations = await prisma.negotiation.findMany({
    where: { OR: [{ sellerOrgId: user.org.id }, { buyerOrgId: user.org.id }] },
    include: {
      listing: { include: { product: true } },
      sellerOrg: { select: { legalName: true } },
      buyerOrg: { select: { legalName: true } },
      offers: { orderBy: { createdAt: 'asc' } },
    },
    orderBy: { updatedAt: 'desc' },
    take: 100,
  });
  return ok(negotiations);
});
