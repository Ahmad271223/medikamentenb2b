import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/db';

type Db = PrismaClient | Prisma.TransactionClient;

/** In-app notification to the OWNER/ADMIN members of an organization. */
export async function notifyOrgOwners(
  orgId: string,
  notification: { type: string; title: string; body?: string; data?: Prisma.InputJsonValue },
  db: Db = prisma,
): Promise<void> {
  const members = await db.organizationMember.findMany({
    where: { orgId, role: { in: ['OWNER', 'ADMIN'] }, status: 'ACTIVE' },
    select: { userId: true },
  });
  if (members.length === 0) return;
  await db.notification.createMany({
    data: members.map((m) => ({
      userId: m.userId,
      orgId,
      type: notification.type,
      title: notification.title,
      body: notification.body ?? null,
      data: notification.data,
    })),
  });
}
