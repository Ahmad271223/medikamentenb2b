/**
 * M6-Enterprise acceptance against the real database:
 *  1. API keys: Bearer resolution carries the key's role and org; revoked or
 *     unknown keys resolve to nothing; keys can never exceed creatable roles.
 *  2. Webhooks: signed delivery to a live local endpoint (HMAC verified),
 *     delivery log SUCCESS; unreachable endpoints log FAILED after retries.
 *  3. Dispute: party opens after delivery; officer resolution REJECTED refunds
 *     the payment and releases the reservation.
 *  4. INVITE_ONLY: invisible and unbuyable without an invite, visible with one.
 *
 * Requires seeded DB; runs after m2 (rerun-safe).
 */
import { createServer, type Server } from 'node:http';
import { createHmac } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { createApiKey, resolveApiKey, revokeApiKey } from '@/server/api-key-service';
import { createWebhookEndpoint, emitWebhookEvent } from '@/server/webhook-service';
import { hasPermission } from '@/lib/authz/permissions';
import { toActor } from '@/lib/auth/current';
import { createListing, activateListing, inviteBuyerToListing } from '@/server/listing-service';
import { searchMarketplace } from '@/server/marketplace-service';
import { submitOffer, respondToOffer } from '@/server/offer-service';
import { applyTransactionDecision, openDispute, resolveDispute } from '@/server/transaction-service';
import { authorizePayment } from '@/server/payment-service';
import { createShipment, dispatchShipment, recordShipmentEvent } from '@/server/shipment-service';
import { diffDaysUtc } from '@/domain/dates';
import type { CurrentUser } from '@/lib/auth/current';

let sellerUser: CurrentUser;
let buyerUser: CurrentUser;
let officerId: string;
let keOrgId: string;

const received: Array<{ body: string; signature: string }> = [];
let server: Server;
let serverUrl = '';

function asUser(u: { id: string; email: string }, org: unknown): CurrentUser {
  return {
    id: u.id, email: u.email, firstName: 'itest', lastName: 'itest', locale: 'de',
    platformRole: null, org: org as CurrentUser['org'], orgRole: 'OWNER',
  };
}

beforeAll(async () => {
  const [seller, buyer, officer, keOrg] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { email: 'seller@demo.pharmabridge.local' },
      include: { memberships: { include: { org: true } } },
    }),
    prisma.user.findUniqueOrThrow({
      where: { email: 'buyer@demo.pharmabridge.local' },
      include: { memberships: { include: { org: true } } },
    }),
    prisma.user.findUniqueOrThrow({ where: { email: 'compliance@demo.pharmabridge.local' } }),
    prisma.organization.findFirstOrThrow({ where: { legalName: { contains: 'Nairobi Med Imports' } } }),
  ]);
  sellerUser = asUser(seller, seller.memberships[0]!.org);
  buyerUser = asUser(buyer, buyer.memberships[0]!.org);
  officerId = officer.id;
  keOrgId = keOrg.id;

  server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      received.push({ body, signature: (req.headers['x-pb-signature'] as string) ?? '' });
      res.writeHead(200);
      res.end('ok');
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  serverUrl = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}/hook`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('M6 enterprise acceptance', () => {
  it('1 — API keys: role-scoped Bearer access, revocation, no escalation', async () => {
    await expect(createApiKey(sellerUser, 'itest escalation', 'OWNER' as never)).rejects.toMatchObject({
      message: 'ROLE_NOT_ALLOWED_FOR_KEYS',
    });

    const key = await createApiKey(sellerUser, 'itest viewer key', 'VIEWER');
    expect(key.token.startsWith('pbk_')).toBe(true);

    const resolved = await resolveApiKey(key.token);
    expect(resolved).not.toBeNull();
    expect(resolved!.org!.id).toBe(sellerUser.org!.id);
    expect(resolved!.orgRole).toBe('VIEWER');
    // The permission matrix applies identically to machine actors.
    expect(hasPermission(toActor(resolved!), 'org:read', { orgId: sellerUser.org!.id })).toBe(true);
    expect(hasPermission(toActor(resolved!), 'batch:manage', { orgId: sellerUser.org!.id })).toBe(false);

    expect(await resolveApiKey('pbk_nonsense_token')).toBeNull();

    await revokeApiKey(sellerUser, key.id);
    expect(await resolveApiKey(key.token)).toBeNull();
  });

  it('2 — webhooks: HMAC-signed delivery with log; unreachable endpoints record FAILED', async () => {
    received.length = 0;
    const endpoint = await createWebhookEndpoint(sellerUser, serverUrl, ['recall.issued']);
    await emitWebhookEvent([sellerUser.org!.id], 'recall.issued', { itest: true, n: 42 });

    expect(received.length).toBe(1);
    const expected = `sha256=${createHmac('sha256', endpoint.secret).update(received[0]!.body).digest('hex')}`;
    expect(received[0]!.signature).toBe(expected);
    const parsed = JSON.parse(received[0]!.body) as { event: string; data: { n: number } };
    expect(parsed.event).toBe('recall.issued');
    expect(parsed.data.n).toBe(42);

    const delivery = await prisma.webhookDelivery.findFirstOrThrow({
      where: { endpointId: endpoint.id },
      orderBy: { createdAt: 'desc' },
    });
    expect(delivery.status).toBe('SUCCESS');
    expect(delivery.responseCode).toBe(200);

    // Unreachable endpoint → FAILED with retry count.
    const dead = await createWebhookEndpoint(sellerUser, 'http://127.0.0.1:9/hook', ['recall.issued']);
    await emitWebhookEvent([sellerUser.org!.id], 'recall.issued', { itest: 'dead' });
    const deadDelivery = await prisma.webhookDelivery.findFirstOrThrow({
      where: { endpointId: dead.id },
      orderBy: { createdAt: 'desc' },
    });
    expect(deadDelivery.status).toBe('FAILED');
    expect(deadDelivery.attempts).toBe(2);

    // Cleanup so later suites don't deliver to the ephemeral server.
    await prisma.webhookEndpoint.updateMany({
      where: { orgId: sellerUser.org!.id },
      data: { active: false, revokedAt: new Date() },
    });
  });

  it('3 — dispute: buyer opens after delivery, officer REJECTED refunds and releases the reservation', async () => {
    const listing = await prisma.listing.findFirstOrThrow({
      where: { batch: { lotNumber: 'DEMO-LOT-2503' }, status: 'ACTIVE', deletedAt: null },
      include: { batch: { include: { position: true } } },
    });
    const reservedBefore = listing.batch.position!.reserved;
    const qtyBefore = listing.quantityAvailable;

    const offer = await submitOffer(buyerUser, { listingId: listing.id, quantity: 300, unitPrice: '8.55' });
    const accepted = await respondToOffer(sellerUser, offer.offerId, { action: 'ACCEPT' });
    const txId = (accepted as { transactionId: string }).transactionId;

    await prisma.$transaction((db) => applyTransactionDecision(txId, 'APPROVED', 'itest m7', officerId, db));
    await authorizePayment(buyerUser.id, buyerUser.org!.id, txId);
    const booked = await createShipment(sellerUser.id, sellerUser.org!.id, {
      transactionId: txId,
      carrier: 'DEMO Air Cargo',
      estimatedArrival: '2026-09-20',
    });
    await dispatchShipment(sellerUser.id, sellerUser.org!.id, booked.shipmentId);
    await recordShipmentEvent(sellerUser.id, booked.shipmentId, { type: 'CUSTOMS_IN' });
    await recordShipmentEvent(sellerUser.id, booked.shipmentId, { type: 'DELIVERED' });

    // An outsider cannot dispute.
    await expect(openDispute(buyerUser.id, keOrgId, txId, 'itest outsider')).rejects.toMatchObject({
      message: 'NOT_PARTY',
    });

    await openDispute(buyerUser.id, buyerUser.org!.id, txId, 'itest: Teillieferung beschädigt');
    let tx = await prisma.transaction.findUniqueOrThrow({ where: { id: txId } });
    expect(tx.state).toBe('DISPUTE');

    await resolveDispute(officerId, txId, 'REJECTED', 'itest: Rückabwicklung');
    tx = await prisma.transaction.findUniqueOrThrow({ where: { id: txId }, include: { payments: true } as never });
    expect(tx.state).toBe('REJECTED');
    const payment = await prisma.payment.findFirstOrThrow({ where: { transactionId: txId } });
    expect(payment.state).toBe('REFUNDED');

    const after = await prisma.batch.findFirstOrThrow({
      where: { lotNumber: 'DEMO-LOT-2503' },
      include: { position: true },
    });
    expect(after.position!.reserved).toBe(reservedBefore); // reservation fully released
    const listingAfter = await prisma.listing.findUniqueOrThrow({ where: { id: listing.id } });
    expect(listingAfter.quantityAvailable).toBe(qtyBefore); // quantity returned
  });

  it('4 — INVITE_ONLY: hidden and unbuyable without an invite, visible with one', async () => {
    // Arrangement: dedicated batch + invite-only listing (rerun-safe).
    let batch = await prisma.batch.findFirst({
      where: { lotNumber: 'ITEST-INVITE', sellerOrgId: sellerUser.org!.id },
      include: { position: true },
    });
    batch ??= await prisma.batch.create({
      data: {
        productId: (await prisma.product.findFirstOrThrow({ where: { inn: 'Amoxicillin' } })).id,
        sellerOrgId: sellerUser.org!.id,
        warehouseId: (await prisma.warehouse.findFirstOrThrow({ where: { orgId: sellerUser.org!.id } })).id,
        lotNumber: 'ITEST-INVITE',
        manufacturingDate: new Date('2025-06-30T00:00:00.000Z'),
        expiryDate: new Date('2028-06-30T00:00:00.000Z'),
        originalShelfLifeDays: diffDaysUtc(new Date('2028-06-30T00:00:00.000Z'), new Date('2025-06-30T00:00:00.000Z')),
        quantity: 1000,
        qualityStatus: 'VERIFIED',
        isDemo: true,
        position: { create: { onHand: 1000 } },
      },
      include: { position: true },
    });

    let listing = await prisma.listing.findFirst({
      where: { batchId: batch.id, status: { in: ['DRAFT', 'PENDING_COMPLIANCE', 'ACTIVE', 'PAUSED'] }, deletedAt: null },
    });
    if (!listing) {
      const created = await createListing(sellerUser, {
        batchId: batch.id,
        quantity: 1000,
        minOrderQuantity: 50,
        unitPrice: '4.44',
        currency: 'EUR',
        negotiable: true,
        visibility: 'INVITE_ONLY',
        anonymousSeller: false,
      });
      if (created.status !== 'ACTIVE') await activateListing(created.listingId, officerId);
      listing = await prisma.listing.findUniqueOrThrow({ where: { id: created.listingId } });
    }

    await prisma.listingInvite.deleteMany({ where: { listingId: listing.id } });

    const before = await searchMarketplace(buyerUser.org!.id, {});
    expect(before.items.map((i) => i.id)).not.toContain(listing.id);
    await expect(
      submitOffer(buyerUser, { listingId: listing.id, quantity: 100, unitPrice: '4.44' }),
    ).rejects.toMatchObject({ message: 'VISIBILITY_RESTRICTED' });

    await inviteBuyerToListing(sellerUser, listing.id, buyerUser.org!.id);

    const after = await searchMarketplace(buyerUser.org!.id, {});
    expect(after.items.map((i) => i.id)).toContain(listing.id);
  });
});
