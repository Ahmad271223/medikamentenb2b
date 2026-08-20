import { prisma } from '@/lib/db';
import { ApiError } from '@/lib/errors';
import { writeAudit } from '@/lib/audit/audit';
import { canTransition } from '@/domain/transactions/state-machine';
import { getPaymentProvider } from '@/lib/payments/provider';
import { notifyOrgOwners } from './notify';

/** Buyer authorizes payment: READY_FOR_PAYMENT → PAYMENT_AUTHORIZED. */
export async function authorizePayment(userId: string, buyerOrgId: string, transactionId: string) {
  const tx = await prisma.transaction.findUniqueOrThrow({ where: { id: transactionId } });
  if (tx.buyerOrgId !== buyerOrgId) throw new ApiError('FORBIDDEN', 403, 'NOT_BUYER');
  const landedCost = tx.buyerLandedCost;
  if (!landedCost) throw new ApiError('CONFLICT', 409, 'ECONOMICS_MISSING');

  const provider = getPaymentProvider();
  const auth = await provider.authorize({
    transactionId: tx.id,
    amount: landedCost.toString(),
    currency: tx.currency,
  });
  if (auth.state !== 'AUTHORIZED') throw new ApiError('CONFLICT', 409, 'PAYMENT_AUTHORIZATION_FAILED');

  const step = canTransition(tx.state, 'PAYMENT_AUTHORIZED', 'BUYER', { paymentAuthorized: true });
  if (!step.allowed) throw new ApiError('CONFLICT', 409, step.code);

  await prisma.$transaction(async (db) => {
    await db.payment.create({
      data: {
        transactionId: tx.id,
        provider: provider.name,
        providerRef: auth.providerRef,
        state: 'AUTHORIZED',
        amount: landedCost,
        currency: tx.currency,
      },
    });
    await db.transaction.update({ where: { id: tx.id }, data: { state: 'PAYMENT_AUTHORIZED' } });
    await db.transactionStateEvent.create({
      data: {
        transactionId: tx.id,
        fromState: tx.state,
        toState: 'PAYMENT_AUTHORIZED',
        actorType: 'USER',
        actorUserId: userId,
      },
    });
    await writeAudit(
      {
        actorUserId: userId,
        orgId: buyerOrgId,
        action: 'PAYMENT_AUTHORIZED',
        entityType: 'Transaction',
        entityId: tx.id,
        newValue: { provider: provider.name, providerRef: auth.providerRef, amount: landedCost.toString() },
      },
      db,
    );
  });
  await notifyOrgOwners(tx.sellerOrgId, {
    type: 'PAYMENT_AUTHORIZED',
    title: 'Zahlung autorisiert / Payment authorized',
    data: { transactionId: tx.id },
  });
  return { state: 'PAYMENT_AUTHORIZED' as const };
}

// Count-based numbering inside the settlement transaction is sufficient while
// settlements are serialized; production replaces this with a Postgres
// sequence (the @unique constraint on Invoice.number catches any race).
async function nextInvoiceNumber(db: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]): Promise<string> {
  const year = new Date().getUTCFullYear();
  const count = await db.invoice.count();
  return `PB-${year}-${String(count + 1).padStart(5, '0')}`;
}

/**
 * Settlement (spec §70 tail): runs when the buyer confirms receipt.
 * Releases the payment via the provider, executes the seller payout record,
 * writes both invoices, books inventory (reserved → sold), and settles the
 * transaction — all in one database transaction, fully audited.
 */
export async function settleTransaction(actorUserId: string | null, transactionId: string) {
  const tx = await prisma.transaction.findUniqueOrThrow({
    where: { id: transactionId },
    include: { payments: true, batch: { include: { position: true } } },
  });
  const step = canTransition(tx.state, 'SETTLED', 'SYSTEM');
  if (!step.allowed) throw new ApiError('CONFLICT', 409, step.code);

  const payment = tx.payments.find((p) => p.state === 'AUTHORIZED');
  if (!payment) throw new ApiError('CONFLICT', 409, 'NO_AUTHORIZED_PAYMENT');

  const provider = getPaymentProvider();
  const release = await provider.release({ providerRef: payment.providerRef ?? '' });
  if (release.state !== 'RELEASED') throw new ApiError('CONFLICT', 409, 'PAYMENT_RELEASE_FAILED');

  await prisma.$transaction(async (db) => {
    await db.payment.update({ where: { id: payment.id }, data: { state: 'RELEASED' } });
    await db.payout.create({
      data: {
        transactionId: tx.id,
        sellerOrgId: tx.sellerOrgId,
        amount: tx.sellerPayout ?? tx.subtotal ?? payment.amount,
        currency: tx.currency,
        state: 'EXECUTED',
        executedAt: new Date(),
      },
    });

    // Invoices: buyer invoice for the landed amount, commission invoice to the
    // seller. Tax handling is deliberately 0 pending counsel (documented).
    const buyerNumber = await nextInvoiceNumber(db);
    await db.invoice.create({
      data: {
        transactionId: tx.id,
        number: buyerNumber,
        type: 'BUYER_INVOICE',
        netAmount: tx.buyerLandedCost ?? payment.amount,
        taxAmount: '0',
        grossAmount: tx.buyerLandedCost ?? payment.amount,
        currency: tx.currency,
        issuedAt: new Date(),
      },
    });
    const commissionNumber = await nextInvoiceNumber(db);
    await db.invoice.create({
      data: {
        transactionId: tx.id,
        number: commissionNumber,
        type: 'COMMISSION',
        netAmount: tx.commissionAmount ?? '0',
        taxAmount: '0',
        grossAmount: tx.commissionAmount ?? '0',
        currency: tx.currency,
        issuedAt: new Date(),
      },
    });

    // Inventory booking: reserved quantity becomes sold, stock decreases.
    if (tx.batch.position) {
      await db.inventoryPosition.update({
        where: { id: tx.batch.position.id },
        data: {
          reserved: { decrement: tx.quantity },
          onHand: { decrement: tx.quantity },
          sold: { increment: tx.quantity },
        },
      });
    }

    await db.transaction.update({ where: { id: tx.id }, data: { state: 'SETTLED' } });
    await db.transactionStateEvent.create({
      data: {
        transactionId: tx.id,
        fromState: tx.state,
        toState: 'SETTLED',
        actorType: 'SYSTEM',
        actorUserId,
      },
    });
    await writeAudit(
      {
        actorType: 'SYSTEM',
        actorUserId,
        orgId: tx.sellerOrgId,
        action: 'TRANSACTION_SETTLED',
        entityType: 'Transaction',
        entityId: tx.id,
        newValue: {
          payout: (tx.sellerPayout ?? tx.subtotal)?.toString(),
          platformRevenue: tx.platformRevenue?.toString(),
          invoices: [buyerNumber, commissionNumber],
        },
      },
      db,
    );
  });

  await Promise.all([
    notifyOrgOwners(tx.sellerOrgId, {
      type: 'TRANSACTION_SETTLED',
      title: 'Transaktion abgerechnet / Transaction settled',
      data: { transactionId: tx.id },
    }),
    notifyOrgOwners(tx.buyerOrgId, {
      type: 'TRANSACTION_SETTLED',
      title: 'Transaktion abgerechnet / Transaction settled',
      data: { transactionId: tx.id },
    }),
  ]);

  return { state: 'SETTLED' as const };
}
