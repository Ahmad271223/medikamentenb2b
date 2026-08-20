/**
 * M4 acceptance — the full §70 lifecycle to SETTLED against the real database:
 * offer → accept → documents-required loop → officer release → payment
 * authorization (MANUAL_DEMO provider) → shipment booking → dispatch is
 * BLOCKED when the re-checked arrival violates the destination rule, succeeds
 * with a viable ETA → customs → delivered → buyer confirms → settlement
 * (payment released, payout executed, invoices written, inventory booked).
 *
 * Requires: docker compose up -d && npm run db:migrate && npm run db:seed
 * (Runs after m2/m3 acceptance; rerun-safe — each run walks a fresh deal.)
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { submitOffer, respondToOffer } from '@/server/offer-service';
import { applyTransactionDecision, confirmReceipt, requestDocuments, resubmitForReview } from '@/server/transaction-service';
import { authorizePayment } from '@/server/payment-service';
import { createShipment, dispatchShipment, isTemperatureExcursion, recordShipmentEvent, recordTemperature } from '@/server/shipment-service';
import type { CurrentUser } from '@/lib/auth/current';

let sellerUser: CurrentUser;
let buyerUser: CurrentUser;
let officerId: string;
let txId: string;
let shipmentId: string;

function asUser(u: { id: string; email: string }, org: unknown): CurrentUser {
  return {
    id: u.id, email: u.email, firstName: 'itest', lastName: 'itest', locale: 'de',
    platformRole: null, org: org as CurrentUser['org'], orgRole: 'OWNER',
  };
}

beforeAll(async () => {
  const [seller, buyer, officer] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { email: 'seller@demo.pharmabridge.local' },
      include: { memberships: { include: { org: true } } },
    }),
    prisma.user.findUniqueOrThrow({
      where: { email: 'buyer@demo.pharmabridge.local' },
      include: { memberships: { include: { org: true } } },
    }),
    prisma.user.findUniqueOrThrow({ where: { email: 'compliance@demo.pharmabridge.local' } }),
  ]);
  sellerUser = asUser(seller, seller.memberships[0]!.org);
  buyerUser = asUser(buyer, buyer.memberships[0]!.org);
  officerId = officer.id;
});

describe('M4 acceptance — full lifecycle to SETTLED', () => {
  it('walks offer → accept → documents loop → release', async () => {
    const listing = await prisma.listing.findFirstOrThrow({
      where: { batch: { lotNumber: 'DEMO-LOT-2503' }, status: { in: ['ACTIVE', 'SOLD_OUT'] }, deletedAt: null },
    });
    expect(listing.status).toBe('ACTIVE');

    const offer = await submitOffer(buyerUser, { listingId: listing.id, quantity: 400, unitPrice: '8.50' });
    const accepted = await respondToOffer(sellerUser, offer.offerId, { action: 'ACCEPT' });
    expect(accepted.status).toBe('ACCEPTED');
    txId = (accepted as { transactionId: string }).transactionId;

    // Documents-required loop.
    await requestDocuments(officerId, txId, 'itest: CoA bitte nachreichen');
    let tx = await prisma.transaction.findUniqueOrThrow({ where: { id: txId } });
    expect(tx.state).toBe('DOCUMENTS_REQUIRED');
    const review = await prisma.complianceReview.findFirstOrThrow({
      where: { transactionId: txId, type: 'TRANSACTION' },
    });
    expect(review.status).toBe('NEEDS_DOCUMENTS');

    await resubmitForReview(sellerUser.id, sellerUser.org!.id, txId);
    tx = await prisma.transaction.findUniqueOrThrow({ where: { id: txId } });
    expect(tx.state).toBe('COMPLIANCE_REVIEW');

    // Ensure a verified CoA exists for the batch (guard requirement).
    const existingCoA = await prisma.document.findFirst({
      where: { batchId: tx.batchId, type: 'CERTIFICATE_OF_ANALYSIS', status: 'VERIFIED', deletedAt: null },
    });
    if (!existingCoA) {
      await prisma.document.create({
        data: {
          ownerOrgId: sellerUser.org!.id, type: 'CERTIFICATE_OF_ANALYSIS',
          fileName: 'coa-m4.pdf', mimeType: 'application/pdf', sizeBytes: 4,
          storageKey: `itest/m4-${txId}`, sha256: 'itest', status: 'VERIFIED',
          batchId: tx.batchId, uploadedById: sellerUser.id, isDemo: true,
        },
      });
    }

    await prisma.$transaction((db) => applyTransactionDecision(txId, 'APPROVED', 'itest: released', officerId, db));
    tx = await prisma.transaction.findUniqueOrThrow({ where: { id: txId } });
    expect(tx.state).toBe('READY_FOR_PAYMENT');
  });

  it('authorizes payment via the MANUAL_DEMO provider (no real funds)', async () => {
    const result = await authorizePayment(buyerUser.id, buyerUser.org!.id, txId);
    expect(result.state).toBe('PAYMENT_AUTHORIZED');
    const payment = await prisma.payment.findFirstOrThrow({ where: { transactionId: txId } });
    expect(payment.provider).toBe('MANUAL_DEMO');
    expect(payment.providerRef?.startsWith('DEMO-')).toBe(true);
    expect(payment.state).toBe('AUTHORIZED');
  });

  it('books the shipment; dispatch is BLOCKED for a non-viable ETA and succeeds with a viable one', async () => {
    // ETA far beyond the destination's shelf-life viability window.
    const booked = await createShipment(sellerUser.id, sellerUser.org!.id, {
      transactionId: txId,
      carrier: 'DEMO Air Cargo',
      estimatedArrival: '2028-06-01',
    });
    shipmentId = booked.shipmentId;
    const tx = await prisma.transaction.findUniqueOrThrow({ where: { id: txId } });
    expect(tx.state).toBe('READY_FOR_PICKUP');

    await expect(dispatchShipment(sellerUser.id, sellerUser.org!.id, shipmentId)).rejects.toMatchObject({
      message: 'SHELF_LIFE_RECHECK_FAILED',
    });

    // Buyer must not be able to dispatch either (party guard).
    await expect(dispatchShipment(buyerUser.id, buyerUser.org!.id, shipmentId)).rejects.toMatchObject({
      message: 'NOT_SELLER',
    });

    // Corrected, viable ETA → dispatch passes the re-check.
    await prisma.shipment.update({
      where: { id: shipmentId },
      data: { estimatedArrival: new Date('2026-09-15T00:00:00.000Z') },
    });
    const dispatched = await dispatchShipment(sellerUser.id, sellerUser.org!.id, shipmentId);
    expect(dispatched.state).toBe('IN_TRANSIT');
  });

  it('advances through customs and delivery via recorded milestones', async () => {
    await recordShipmentEvent(sellerUser.id, shipmentId, { type: 'CUSTOMS_IN', location: 'DEMO airport' });
    let tx = await prisma.transaction.findUniqueOrThrow({ where: { id: txId } });
    expect(tx.state).toBe('CUSTOMS');

    await recordShipmentEvent(sellerUser.id, shipmentId, { type: 'CUSTOMS_CLEARED' });
    await recordShipmentEvent(sellerUser.id, shipmentId, { type: 'DELIVERED' });
    tx = await prisma.transaction.findUniqueOrThrow({ where: { id: txId } });
    expect(tx.state).toBe('DELIVERED');

    const shipment = await prisma.shipment.findUniqueOrThrow({ where: { id: shipmentId } });
    expect(shipment.status).toBe('DELIVERED');
    expect(shipment.actualArrival).not.toBeNull();
  });

  it('records temperature; excursion detection is exact', async () => {
    const noRange = await recordTemperature(sellerUser.id, shipmentId, { temperatureC: 21.5 });
    expect(noRange.excursion).toBe(false); // product has no declared range → no excursion claim

    expect(isTemperatureExcursion(9, 2, 8)).toBe(true);
    expect(isTemperatureExcursion(5, 2, 8)).toBe(false);
    expect(isTemperatureExcursion(-1, 2, 8)).toBe(true);
    expect(isTemperatureExcursion(25, null, null)).toBe(false);
  });

  it('buyer confirmation settles: payment released, payout executed, invoices written, inventory booked', async () => {
    const positionBefore = await prisma.inventoryPosition.findFirstOrThrow({
      where: { batch: { lotNumber: 'DEMO-LOT-2503' } },
    });

    // Only the buyer may confirm receipt.
    await expect(confirmReceipt(sellerUser.id, sellerUser.org!.id, txId)).rejects.toMatchObject({
      message: 'NOT_BUYER',
    });

    const settled = await confirmReceipt(buyerUser.id, buyerUser.org!.id, txId);
    expect(settled.state).toBe('SETTLED');

    const tx = await prisma.transaction.findUniqueOrThrow({
      where: { id: txId },
      include: { payments: true, payouts: true, invoices: true, stateEvents: { orderBy: { createdAt: 'asc' } } },
    });
    expect(tx.state).toBe('SETTLED');
    expect(tx.payments[0]?.state).toBe('RELEASED');
    expect(tx.payouts[0]?.state).toBe('EXECUTED');
    expect(tx.payouts[0]?.amount.toFixed(2)).toBe(tx.sellerPayout?.toFixed(2));
    expect(tx.invoices.map((i) => i.type).sort()).toEqual(['BUYER_INVOICE', 'COMMISSION']);
    expect(new Set(tx.invoices.map((i) => i.number)).size).toBe(2);

    const states = tx.stateEvents.map((e) => e.toState);
    expect(states).toEqual([
      'OFFER_ACCEPTED', 'COMPLIANCE_REVIEW', 'DOCUMENTS_REQUIRED', 'COMPLIANCE_REVIEW',
      'READY_FOR_PAYMENT', 'PAYMENT_AUTHORIZED', 'READY_FOR_PICKUP', 'IN_TRANSIT',
      'CUSTOMS', 'DELIVERED', 'BUYER_ACCEPTED', 'SETTLED',
    ]);

    const positionAfter = await prisma.inventoryPosition.findFirstOrThrow({
      where: { batch: { lotNumber: 'DEMO-LOT-2503' } },
    });
    expect(positionAfter.onHand).toBe(positionBefore.onHand - 400);
    expect(positionAfter.reserved).toBe(positionBefore.reserved - 400);
    expect(positionAfter.sold).toBe(positionBefore.sold + 400);
  });
});
