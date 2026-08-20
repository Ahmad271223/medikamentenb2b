import { prisma } from '@/lib/db';
import { ApiError, handle, ok, requirePermission } from '@/lib/api';

export const GET = handle(async () => {
  const user = await requirePermission('transaction:read');
  if (!user.org && !user.platformRole) throw new ApiError('NOT_FOUND', 404, 'NO_ORGANIZATION');
  const transactions = await prisma.transaction.findMany({
    where: user.platformRole
      ? {}
      : { OR: [{ sellerOrgId: user.org!.id }, { buyerOrgId: user.org!.id }] },
    include: {
      listing: { include: { product: true } },
      sellerOrg: { select: { legalName: true } },
      buyerOrg: { select: { legalName: true } },
      destinationCountry: true,
      stateEvents: { orderBy: { createdAt: 'asc' } },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  return ok(transactions);
});
