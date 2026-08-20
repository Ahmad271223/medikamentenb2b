import { prisma } from '@/lib/db';
import { ApiError } from '@/lib/errors';
import { notifyOrgOwners } from './notify';

// Deal-room messages (spec §60, chat part): visible to both parties and
// platform compliance. Messages are commercial correspondence — retained with
// the transaction, not duplicated into the audit log.

async function assertParticipant(userOrgId: string | null, isPlatform: boolean, transactionId: string) {
  const tx = await prisma.transaction.findUnique({
    where: { id: transactionId },
    select: { id: true, sellerOrgId: true, buyerOrgId: true },
  });
  if (!tx) throw new ApiError('NOT_FOUND', 404, 'TRANSACTION_NOT_FOUND');
  const isParty = userOrgId !== null && (tx.sellerOrgId === userOrgId || tx.buyerOrgId === userOrgId);
  if (!isParty && !isPlatform) throw new ApiError('FORBIDDEN', 403, 'NOT_PARTY');
  return tx;
}

export async function listMessages(userOrgId: string | null, isPlatform: boolean, transactionId: string) {
  await assertParticipant(userOrgId, isPlatform, transactionId);
  return prisma.dealMessage.findMany({
    where: { transactionId },
    include: {
      authorUser: { select: { firstName: true, lastName: true, platformRole: true } },
      org: { select: { legalName: true } },
    },
    orderBy: { createdAt: 'asc' },
    take: 200,
  });
}

export async function postMessage(
  user: { id: string; orgId: string | null; isPlatform: boolean },
  transactionId: string,
  body: string,
) {
  const tx = await assertParticipant(user.orgId, user.isPlatform, transactionId);
  const message = await prisma.dealMessage.create({
    data: {
      transactionId,
      authorUserId: user.id,
      orgId: user.orgId,
      body,
    },
  });

  // Notify the other side(s); platform messages notify both parties.
  const recipients = new Set<string>();
  if (user.orgId === tx.sellerOrgId) recipients.add(tx.buyerOrgId);
  else if (user.orgId === tx.buyerOrgId) recipients.add(tx.sellerOrgId);
  else {
    recipients.add(tx.sellerOrgId);
    recipients.add(tx.buyerOrgId);
  }
  await Promise.all(
    [...recipients].map((orgId) =>
      notifyOrgOwners(orgId, {
        type: 'DEAL_MESSAGE',
        title: 'Neue Deal-Nachricht / New deal message',
        body: body.slice(0, 140),
        data: { transactionId },
      }),
    ),
  );
  return { messageId: message.id };
}
