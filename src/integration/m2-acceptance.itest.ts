/**
 * M2 acceptance criteria (docs/architecture/J-mvp-roadmap.md) verified against
 * the real database with seeded DEMO data:
 *
 *  1. Seller lists a batch → eligibility snapshots → auto-activation (low-risk).
 *  2. A restricted listing is INVISIBLE to a wrong-country buyer, and a
 *     prohibited match is BLOCKED server-side with an explanation.
 *  3. The eligible buyer sees the listing.
 *  4. Offer → counter → accept creates a transaction in COMPLIANCE_REVIEW with
 *     exact economics and inventory reservation.
 *  5. The officer CANNOT release while a required document is missing; with a
 *     verified CoA the release succeeds (real guard context, not a checkbox).
 *
 * Requires: docker compose up -d && npm run db:migrate && npm run db:seed
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { createListing } from '@/server/listing-service';
import { searchMarketplace } from '@/server/marketplace-service';
import { submitOffer, respondToOffer } from '@/server/offer-service';
import { applyTransactionDecision, buildComplianceCtx } from '@/server/transaction-service';
import { hashPassword } from '@/lib/crypto/password';
import type { CurrentUser } from '@/lib/auth/current';

const OPEN_LISTING_STATUSES = ['DRAFT', 'PENDING_COMPLIANCE', 'ACTIVE', 'PAUSED'] as const;

function asUser(u: { id: string; email: string }, org: { id: string; kind: string; legalName: string; status: string }): CurrentUser {
  return {
    id: u.id,
    email: u.email,
    firstName: 'itest',
    lastName: 'itest',
    locale: 'de',
    platformRole: null,
    org: org as CurrentUser['org'],
    orgRole: 'OWNER',
  };
}

let sellerUser: CurrentUser;
let buyerUser: CurrentUser;
let keBuyerUser: CurrentUser;
let officerId: string;
let listingId: string;

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

  // Wrong-country buyer: fully verified org in KE — the ONLY thing standing
  // between it and the listing is destination eligibility.
  let keUser = await prisma.user.findUnique({
    where: { email: 'verifybuyer-ke@demo.pharmabridge.local' },
    include: { memberships: { include: { org: true } } },
  });
  if (!keUser) {
    const passwordHash = await hashPassword('Itest-Password-2026');
    const created = await prisma.user.create({
      data: { email: 'verifybuyer-ke@demo.pharmabridge.local', passwordHash, firstName: 'KE', lastName: 'Buyer [DEMO]' },
    });
    const org = await prisma.organization.create({
      data: {
        kind: 'BUYER',
        legalName: '[DEMO] Nairobi Med Imports Ltd. (itest)',
        countryId: 'KE',
        status: 'VERIFIED',
        kybStatus: 'APPROVED',
        sanctionsStatus: 'CLEAR',
        isDemo: true,
        members: { create: { userId: created.id, role: 'OWNER' } },
        licenses: {
          create: {
            type: 'IMPORT',
            number: 'KE-IMP-ITEST-1',
            issuingAuthority: '[DEMO] itest authority',
            countryId: 'KE',
            expiryDate: new Date('2028-01-01T00:00:00.000Z'),
            status: 'VERIFIED',
            isDemo: true,
          },
        },
      },
    });
    keUser = await prisma.user.findUniqueOrThrow({
      where: { id: created.id },
      include: { memberships: { include: { org: true } } },
    });
    void org;
  }
  keBuyerUser = asUser(keUser, keUser.memberships[0]!.org);
});

describe('M2 acceptance', () => {
  it('1 — seller lists a verified batch, engine snapshots run, listing auto-activates', async () => {
    // Arrangement: quality verification is a compliance act — performed here
    // directly so the low-risk auto-activation path is testable. The batch
    // (Furosemide, exp 2029-03) satisfies the ZZ demo rule (≈62% ≥ 50%, >12mo);
    // the seed's Ceftriaxone batch deliberately would NOT (≈39% < 50%).
    await prisma.batch.updateMany({
      where: { lotNumber: 'DEMO-LOT-2503', qualityStatus: 'UNVERIFIED' },
      data: { qualityStatus: 'VERIFIED', verifiedAt: new Date() },
    });
    const batch = await prisma.batch.findFirstOrThrow({
      where: { lotNumber: 'DEMO-LOT-2503', sellerOrgId: sellerUser.org!.id },
      include: { position: true },
    });
    const existing = await prisma.listing.findFirst({
      where: { batchId: batch.id, status: { in: [...OPEN_LISTING_STATUSES] }, deletedAt: null },
    });
    if (existing) {
      listingId = existing.id;
    } else {
      const available = (batch.position?.onHand ?? batch.quantity) - (batch.position?.reserved ?? 0);
      const result = await createListing(sellerUser, {
        batchId: batch.id,
        quantity: available,
        minOrderQuantity: 100,
        unitPrice: '8.40',
        currency: 'EUR',
        negotiable: true,
        visibility: 'PUBLIC_VERIFIED',
        anonymousSeller: false,
      });
      expect(result.status).toBe('ACTIVE'); // fully verified low-risk case
      listingId = result.listingId;
    }
    const snapshots = await prisma.listingEligibility.count({ where: { listingId } });
    expect(snapshots).toBeGreaterThanOrEqual(25);
  });

  it('2 — restricted listing is hidden from the wrong-country buyer AND the prohibited match is blocked with an explanation', async () => {
    const search = await searchMarketplace(keBuyerUser.org!.id, {});
    expect(search.verifiedRequired).toBe(false);
    expect(search.items.map((i) => i.id)).not.toContain(listingId);

    // Defense in depth: even a direct API call is rejected with a reason code.
    await expect(
      submitOffer(keBuyerUser, { listingId, quantity: 100, unitPrice: '8.40' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', message: 'DESTINATION_NOT_ELIGIBLE' });
  });

  it('3 — the eligible buyer (ZZ) sees the listing', async () => {
    const search = await searchMarketplace(buyerUser.org!.id, {});
    expect(search.items.map((i) => i.id)).toContain(listingId);
  });

  it('4 — offer → counter → accept creates a COMPLIANCE_REVIEW transaction with exact economics and reservation', async () => {
    const before = await prisma.batch.findFirstOrThrow({
      where: { lotNumber: 'DEMO-LOT-2503' },
      include: { position: true },
    });
    const reservedBefore = before.position!.reserved;

    const offer = await submitOffer(buyerUser, { listingId, quantity: 500, unitPrice: '8.40' });
    const counter = await respondToOffer(sellerUser, offer.offerId, {
      action: 'COUNTER',
      counter: { quantity: 500, unitPrice: '8.60' },
    });
    expect(counter.status).toBe('COUNTERED');

    const accepted = await respondToOffer(buyerUser, (counter as { counterOfferId: string }).counterOfferId, {
      action: 'ACCEPT',
    });
    expect(accepted.status).toBe('ACCEPTED');
    const txId = (accepted as { transactionId: string }).transactionId;

    const tx = await prisma.transaction.findUniqueOrThrow({ where: { id: txId } });
    expect(tx.state).toBe('COMPLIANCE_REVIEW');
    expect(tx.subtotal?.toFixed(2)).toBe('4300.00'); // 500 × 8.60
    expect(tx.commissionAmount?.toFixed(2)).toBe('215.00'); // 5% config
    expect(tx.sellerPayout?.toFixed(2)).toBe('4085.00');

    const after = await prisma.batch.findFirstOrThrow({
      where: { lotNumber: 'DEMO-LOT-2503' },
      include: { position: true },
    });
    expect(after.position!.reserved).toBe(reservedBefore + 500);

    const review = await prisma.complianceReview.findFirst({
      where: { transactionId: txId, type: 'TRANSACTION', status: 'PENDING' },
    });
    expect(review).not.toBeNull();

    const events = await prisma.transactionStateEvent.findMany({
      where: { transactionId: txId },
      orderBy: { createdAt: 'asc' },
    });
    expect(events.map((e) => e.toState)).toEqual(['OFFER_ACCEPTED', 'COMPLIANCE_REVIEW']);
  });

  it('5 — release is blocked while the required CoA is missing; with a verified CoA it succeeds', async () => {
    const tx = await prisma.transaction.findFirstOrThrow({
      where: { state: 'COMPLIANCE_REVIEW', sellerOrgId: sellerUser.org!.id },
      orderBy: { createdAt: 'desc' },
    });

    // Rerun safety: drop CoA documents this test created in earlier runs so the
    // blocked state is deterministic.
    await prisma.document.deleteMany({
      where: { batchId: tx.batchId, storageKey: { startsWith: 'itest/' } },
    });

    const ctxBefore = await buildComplianceCtx(tx.id);
    expect(ctxBefore.permitVerifiedIfRequired).toBe(true); // ZZ demo buyer holds a verified permit
    expect(ctxBefore.requiredDocsVerified).toBe(false); // CoA not on file yet

    await expect(
      prisma.$transaction((db) => applyTransactionDecision(tx.id, 'APPROVED', 'itest', officerId, db)),
    ).rejects.toMatchObject({ code: 'CONFLICT', message: 'DOCS_NOT_VERIFIED' });

    // A verified Certificate of Analysis arrives for the batch.
    await prisma.document.create({
      data: {
        ownerOrgId: sellerUser.org!.id,
        type: 'CERTIFICATE_OF_ANALYSIS',
        fileName: 'coa-itest.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 4,
        storageKey: `itest/${tx.id}`,
        sha256: 'itest',
        status: 'VERIFIED',
        batchId: tx.batchId,
        uploadedById: sellerUser.id,
        isDemo: true,
      },
    });

    await prisma.$transaction((db) => applyTransactionDecision(tx.id, 'APPROVED', 'itest: CoA verified', officerId, db));

    const released = await prisma.transaction.findUniqueOrThrow({ where: { id: tx.id } });
    expect(released.state).toBe('READY_FOR_PAYMENT');
    const lastEvent = await prisma.transactionStateEvent.findFirst({
      where: { transactionId: tx.id },
      orderBy: { createdAt: 'desc' },
    });
    expect(lastEvent?.toState).toBe('READY_FOR_PAYMENT');
    expect(lastEvent?.actorType).toBe('COMPLIANCE');
  });
});
