import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { ApiError } from '@/lib/errors';
import { writeAudit } from '@/lib/audit/audit';
import { canTransition, type TransitionContext } from '@/domain/transactions/state-machine';
import { notifyOrgOwners } from './notify';
import { settleTransaction } from './payment-service';

const SELLER_LICENSES = ['WDA', 'WHOLESALE', 'MANUFACTURING', 'PHARMACY', 'HOSPITAL'];
const BUYER_LICENSES = ['WDA', 'WHOLESALE', 'IMPORT', 'HOSPITAL', 'PHARMACY'];

interface EligibilitySnapshot {
  requiredPermits?: string[];
  requiredDocuments?: string[];
}

/**
 * Computes the REAL guard context for the compliance release from database
 * facts — the officer's approval click cannot override missing permits,
 * invalid licenses, sanctions flags, or a recalled batch.
 */
export async function buildComplianceCtx(transactionId: string): Promise<TransitionContext> {
  const tx = await prisma.transaction.findUniqueOrThrow({
    where: { id: transactionId },
    include: {
      batch: true,
      sellerOrg: { include: { licenses: true } },
      buyerOrg: { include: { licenses: true, permits: true } },
    },
  });
  const now = Date.now();
  const validLicense = (licenses: typeof tx.sellerOrg.licenses, types: string[]) =>
    licenses.some((l) => types.includes(l.type) && l.status === 'VERIFIED' && l.expiryDate.getTime() > now);

  const snapshot = (tx.eligibilitySnapshot ?? {}) as EligibilitySnapshot;
  const requiredPermits = snapshot.requiredPermits ?? [];
  const requiredDocuments = snapshot.requiredDocuments ?? [];

  let permitOk = true;
  if (requiredPermits.includes('IMPORT_PERMIT')) {
    permitOk = tx.buyerOrg.permits.some(
      (p) =>
        p.countryId === tx.destinationCountryId &&
        p.status === 'VERIFIED' &&
        (p.expiryDate === null || p.expiryDate.getTime() > now),
    );
  }

  let docsOk = true;
  if (requiredDocuments.length > 0) {
    const verified = await prisma.document.findMany({
      where: {
        status: 'VERIFIED',
        deletedAt: null,
        OR: [{ batchId: tx.batchId }, { transactionId: tx.id }],
      },
      select: { type: true },
    });
    const have = new Set(verified.map((d) => d.type));
    docsOk = requiredDocuments.every((code) => have.has(code));
  }

  return {
    batchRecalled: tx.batch.recallStatus !== 'NONE',
    batchQuarantined: tx.batch.quarantineStatus === 'QUARANTINED',
    orgSuspended: tx.sellerOrg.status === 'SUSPENDED' || tx.buyerOrg.status === 'SUSPENDED',
    licensesValid:
      validLicense(tx.sellerOrg.licenses, SELLER_LICENSES) && validLicense(tx.buyerOrg.licenses, BUYER_LICENSES),
    sanctionsClear: tx.sellerOrg.sanctionsStatus === 'CLEAR' && tx.buyerOrg.sanctionsStatus === 'CLEAR',
    permitVerifiedIfRequired: permitOk,
    requiredDocsVerified: docsOk,
  };
}

/** Officer sends the transaction into the documents loop (spec §19). */
export async function requestDocuments(officerId: string, transactionId: string, note: string) {
  const tx = await prisma.transaction.findUniqueOrThrow({ where: { id: transactionId } });
  const step = canTransition(tx.state, 'DOCUMENTS_REQUIRED', 'COMPLIANCE_OFFICER');
  if (!step.allowed) throw new ApiError('CONFLICT', 409, step.code);

  await prisma.$transaction(async (db) => {
    await db.transaction.update({ where: { id: tx.id }, data: { state: 'DOCUMENTS_REQUIRED' } });
    await db.transactionStateEvent.create({
      data: { transactionId: tx.id, fromState: tx.state, toState: 'DOCUMENTS_REQUIRED', actorType: 'COMPLIANCE', actorUserId: officerId, reason: note },
    });
    await db.complianceReview.updateMany({
      where: { transactionId: tx.id, type: 'TRANSACTION', status: { in: ['PENDING', 'IN_REVIEW'] } },
      data: { status: 'NEEDS_DOCUMENTS' },
    });
    await writeAudit(
      {
        actorType: 'COMPLIANCE', actorUserId: officerId, orgId: tx.sellerOrgId,
        action: 'TRANSACTION_DOCUMENTS_REQUESTED', entityType: 'Transaction', entityId: tx.id, reason: note,
      },
      db,
    );
  });
  await Promise.all([
    notifyOrgOwners(tx.sellerOrgId, { type: 'DOCUMENTS_REQUIRED', title: 'Dokumente erforderlich / Documents required', body: note, data: { transactionId: tx.id } }),
    notifyOrgOwners(tx.buyerOrgId, { type: 'DOCUMENTS_REQUIRED', title: 'Dokumente erforderlich / Documents required', body: note, data: { transactionId: tx.id } }),
  ]);
  return { state: 'DOCUMENTS_REQUIRED' as const };
}

/** A party signals the requested documents are on file — back to review. */
export async function resubmitForReview(userId: string, partyOrgId: string, transactionId: string) {
  const tx = await prisma.transaction.findUniqueOrThrow({ where: { id: transactionId } });
  if (tx.sellerOrgId !== partyOrgId && tx.buyerOrgId !== partyOrgId) {
    throw new ApiError('FORBIDDEN', 403, 'NOT_PARTY');
  }
  const actor = tx.sellerOrgId === partyOrgId ? 'SELLER' : 'BUYER';
  const step = canTransition(tx.state, 'COMPLIANCE_REVIEW', actor);
  if (!step.allowed) throw new ApiError('CONFLICT', 409, step.code);

  await prisma.$transaction(async (db) => {
    await db.transaction.update({ where: { id: tx.id }, data: { state: 'COMPLIANCE_REVIEW' } });
    await db.transactionStateEvent.create({
      data: { transactionId: tx.id, fromState: tx.state, toState: 'COMPLIANCE_REVIEW', actorType: 'USER', actorUserId: userId },
    });
    await db.complianceReview.updateMany({
      where: { transactionId: tx.id, type: 'TRANSACTION', status: 'NEEDS_DOCUMENTS' },
      data: { status: 'PENDING' },
    });
    await writeAudit(
      {
        actorUserId: userId, orgId: partyOrgId,
        action: 'TRANSACTION_RESUBMITTED', entityType: 'Transaction', entityId: tx.id,
      },
      db,
    );
  });
  return { state: 'COMPLIANCE_REVIEW' as const };
}

/** Buyer confirms receipt → BUYER_ACCEPTED, then settlement runs (spec §70). */
export async function confirmReceipt(userId: string, buyerOrgId: string, transactionId: string) {
  const tx = await prisma.transaction.findUniqueOrThrow({ where: { id: transactionId } });
  if (tx.buyerOrgId !== buyerOrgId) throw new ApiError('FORBIDDEN', 403, 'NOT_BUYER');
  const step = canTransition(tx.state, 'BUYER_ACCEPTED', 'BUYER');
  if (!step.allowed) throw new ApiError('CONFLICT', 409, step.code);

  await prisma.$transaction(async (db) => {
    await db.transaction.update({ where: { id: tx.id }, data: { state: 'BUYER_ACCEPTED' } });
    await db.transactionStateEvent.create({
      data: { transactionId: tx.id, fromState: tx.state, toState: 'BUYER_ACCEPTED', actorType: 'USER', actorUserId: userId },
    });
    await writeAudit(
      { actorUserId: userId, orgId: buyerOrgId, action: 'RECEIPT_CONFIRMED', entityType: 'Transaction', entityId: tx.id },
      db,
    );
  });

  const settled = await settleTransaction(userId, transactionId);
  return settled;
}

export async function applyTransactionDecision(
  transactionId: string,
  decision: 'APPROVED' | 'REJECTED',
  reason: string,
  officerUserId: string,
  db: Prisma.TransactionClient,
): Promise<void> {
  const transaction = await db.transaction.findUniqueOrThrow({
    where: { id: transactionId },
    include: { listing: true, batch: { include: { position: true } } },
  });
  if (transaction.state !== 'COMPLIANCE_REVIEW') {
    throw new ApiError('CONFLICT', 409, 'TRANSACTION_NOT_IN_REVIEW');
  }

  if (decision === 'APPROVED') {
    const ctx = await buildComplianceCtx(transactionId);
    const result = canTransition('COMPLIANCE_REVIEW', 'READY_FOR_PAYMENT', 'COMPLIANCE_OFFICER', ctx);
    if (!result.allowed) {
      // The state machine explains exactly which precondition failed.
      throw new ApiError('CONFLICT', 409, result.code);
    }
    await db.transaction.update({ where: { id: transactionId }, data: { state: 'READY_FOR_PAYMENT' } });
    await db.transactionStateEvent.create({
      data: {
        transactionId,
        fromState: 'COMPLIANCE_REVIEW',
        toState: 'READY_FOR_PAYMENT',
        actorType: 'COMPLIANCE',
        actorUserId: officerUserId,
        reason,
      },
    });
  } else {
    await db.transaction.update({ where: { id: transactionId }, data: { state: 'REJECTED' } });
    await db.transactionStateEvent.create({
      data: {
        transactionId,
        fromState: 'COMPLIANCE_REVIEW',
        toState: 'REJECTED',
        actorType: 'COMPLIANCE',
        actorUserId: officerUserId,
        reason,
      },
    });
    // Release the reservation and give the quantity back to the listing.
    if (transaction.batch.position) {
      await db.inventoryPosition.update({
        where: { id: transaction.batch.position.id },
        data: { reserved: { decrement: transaction.quantity } },
      });
    }
    if (transaction.listing) {
      await db.listing.update({
        where: { id: transaction.listing.id },
        data: {
          quantityAvailable: { increment: transaction.quantity },
          status: transaction.listing.status === 'SOLD_OUT' ? 'ACTIVE' : transaction.listing.status,
        },
      });
    }
  }

  await writeAudit(
    {
      actorType: 'COMPLIANCE',
      actorUserId: officerUserId,
      orgId: transaction.sellerOrgId,
      action: decision === 'APPROVED' ? 'TRANSACTION_RELEASED' : 'TRANSACTION_REJECTED',
      entityType: 'Transaction',
      entityId: transactionId,
      reason,
    },
    db,
  );
  await notifyOrgOwners(
    transaction.buyerOrgId,
    {
      type: decision === 'APPROVED' ? 'TRANSACTION_RELEASED' : 'TRANSACTION_REJECTED',
      title: decision === 'APPROVED' ? 'Transaktion freigegeben / Transaction released' : 'Transaktion abgelehnt / Transaction rejected',
      body: reason,
      data: { transactionId },
    },
    db,
  );
}
