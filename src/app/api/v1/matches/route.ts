import { prisma } from '@/lib/db';
import { ApiError, handle, ok, requirePermission } from '@/lib/api';

export const GET = handle(async () => {
  const user = await requirePermission('transaction:read');
  if (!user.org) throw new ApiError('NOT_FOUND', 404, 'NO_ORGANIZATION');
  const matches = await prisma.match.findMany({
    where: { OR: [{ sellerOrgId: user.org.id }, { buyerOrgId: user.org.id }] },
    include: {
      listing: { include: { product: true } },
      demand: { include: { destinationCountry: true } },
    },
    orderBy: { score: 'desc' },
    take: 100,
  });
  return ok(matches);
});
