import { prisma } from '@/lib/db';
import { handle, ok } from '@/lib/api';

export const GET = handle(async () => {
  await prisma.$queryRaw`SELECT 1`;
  return ok({ status: 'healthy' });
});
