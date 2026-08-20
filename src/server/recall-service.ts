import { prisma } from '@/lib/db';
import { ApiError } from '@/lib/errors';
import { writeAudit } from '@/lib/audit/audit';
import { canTransition, TERMINAL_STATES } from '@/domain/transactions/state-machine';
import { notifyOrgOwners } from './notify';

// Recall management (spec §24): a recalled batch must become impossible to
// trade IMMEDIATELY — listings block, in-flight transactions freeze, affected
// parties are notified, everything is audited.

export interface CreateRecallInput {
  batchIds: string[];
  scope: string;
  sourceName?: string;
  sourceUrl?: string;
  notes?: string;
}

export async function createRecall(userId: string, input: CreateRecallInput) {
  const batches = await prisma.batch.findMany({
    where: { id: { in: input.batchIds }, deletedAt: null },
    include: { product: true },
  });
  if (batches.length === 0 || batches.length !== input.batchIds.length) {
    throw new ApiError('VALIDATION_ERROR', 400, 'UNKNOWN_BATCH');
  }
  const productIds = new Set(batches.map((b) => b.productId));
  const productId = productIds.size === 1 ? batches[0]!.productId : null;

  const result = await prisma.$transaction(async (tx) => {
    const recall = await tx.recall.create({
      data: {
        productId,
        scope: input.scope,
        sourceName: input.sourceName ?? null,
        sourceUrl: input.sourceUrl ?? null,
        status: 'ACTIVE',
        issuedAt: new Date(),
        notes: input.notes ?? null,
        affectedBatches: { create: input.batchIds.map((batchId) => ({ batchId })) },
      },
    });

    await tx.batch.updateMany({
      where: { id: { in: input.batchIds } },
      data: { recallStatus: 'RECALLED' },
    });

    // Cascade 1: open listings become BLOCKED.
    const listings = await tx.listing.findMany({
      where: {
        batchId: { in: input.batchIds },
        deletedAt: null,
        status: { in: ['DRAFT', 'PENDING_COMPLIANCE', 'ACTIVE', 'PAUSED'] },
      },
      select: { id: true, sellerOrgId: true },
    });
    await tx.listing.updateMany({
      where: { id: { in: listings.map((l) => l.id) } },
      data: { status: 'BLOCKED' },
    });

    // Cascade 2: non-terminal transactions freeze into RECALL via the state
    // machine (never by raw update — every transition is validated and logged).
    const transactions = await tx.transaction.findMany({
      where: {
        batchId: { in: input.batchIds },
        state: { notIn: [...TERMINAL_STATES, 'RECALL'] },
      },
      select: { id: true, state: true, buyerOrgId: true, sellerOrgId: true },
    });
    for (const t of transactions) {
      const check = canTransition(t.state, 'RECALL', 'SYSTEM', { batchRecalled: true });
      if (!check.allowed) throw new ApiError('INTERNAL', 500, `STATE_MACHINE_VIOLATION:${check.code}`);
      await tx.transaction.update({ where: { id: t.id }, data: { state: 'RECALL' } });
      await tx.transactionStateEvent.create({
        data: {
          transactionId: t.id,
          fromState: t.state,
          toState: 'RECALL',
          actorType: 'SYSTEM',
          reason: `Recall ${recall.id}: ${input.scope}`,
        },
      });
    }

    await writeAudit(
      {
        actorType: 'COMPLIANCE',
        actorUserId: userId,
        action: 'RECALL_CREATED',
        entityType: 'Recall',
        entityId: recall.id,
        newValue: {
          batchIds: input.batchIds,
          scope: input.scope,
          blockedListings: listings.length,
          frozenTransactions: transactions.length,
        },
      },
      tx,
    );

    return { recall, listings, transactions };
  });

  // Notifications outside the transaction — the recall itself is committed.
  const affectedOrgIds = new Set<string>();
  for (const b of batches) affectedOrgIds.add(b.sellerOrgId);
  for (const l of result.listings) affectedOrgIds.add(l.sellerOrgId);
  for (const t of result.transactions) {
    affectedOrgIds.add(t.buyerOrgId);
    affectedOrgIds.add(t.sellerOrgId);
  }
  await Promise.all(
    [...affectedOrgIds].map((orgId) =>
      notifyOrgOwners(orgId, {
        type: 'RECALL_ISSUED',
        title: 'Chargenrückruf / Batch recall',
        body: input.scope,
        data: { recallId: result.recall.id },
      }),
    ),
  );

  return {
    recallId: result.recall.id,
    recalledBatches: input.batchIds.length,
    blockedListings: result.listings.length,
    frozenTransactions: result.transactions.length,
  };
}

export async function resolveRecall(userId: string, recallId: string) {
  const recall = await prisma.recall.findUnique({ where: { id: recallId } });
  if (!recall) throw new ApiError('NOT_FOUND', 404, 'RECALL_NOT_FOUND');
  if (recall.status === 'RESOLVED') return { status: 'RESOLVED' as const };

  await prisma.$transaction(async (tx) => {
    await tx.recall.update({ where: { id: recallId }, data: { status: 'RESOLVED' } });
    // Batches deliberately STAY recalled — resolution closes the case; the
    // return/destruction workflow (M4+) is what changes batch dispositions.
    await writeAudit(
      {
        actorType: 'COMPLIANCE',
        actorUserId: userId,
        action: 'RECALL_RESOLVED',
        entityType: 'Recall',
        entityId: recallId,
      },
      tx,
    );
  });
  return { status: 'RESOLVED' as const };
}
