/**
 * M5 + deal chat acceptance against the real database:
 *  1. Deal messages: parties and platform can read/post; outsiders cannot.
 *  2. §18 value model: savings are null WITHOUT a sourced reference and exact
 *     WITH one — never invented.
 *  3. Platform analytics aggregates real settled records.
 *
 * Requires seeded DB; runs after m2–m4 acceptance (rerun-safe).
 */
import Decimal from 'decimal.js';
import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { listMessages, postMessage } from '@/server/chat-service';
import { dealValueModel, platformAnalytics } from '@/server/analytics-service';

let sellerOrgId: string;
let buyerOrgId: string;
let buyerUserId: string;
let officerId: string;
let outsiderOrgId: string;
let settledTxId: string;

beforeAll(async () => {
  const [buyer, seller, officer, outsider, settled] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { email: 'buyer@demo.pharmabridge.local' },
      include: { memberships: true },
    }),
    prisma.user.findUniqueOrThrow({
      where: { email: 'seller@demo.pharmabridge.local' },
      include: { memberships: true },
    }),
    prisma.user.findUniqueOrThrow({ where: { email: 'compliance@demo.pharmabridge.local' } }),
    prisma.organization.findFirstOrThrow({ where: { legalName: { contains: 'Nairobi Med Imports' } } }),
    prisma.transaction.findFirstOrThrow({ where: { state: 'SETTLED' }, orderBy: { createdAt: 'desc' } }),
  ]);
  buyerUserId = buyer.id;
  buyerOrgId = buyer.memberships[0]!.orgId;
  sellerOrgId = seller.memberships[0]!.orgId;
  officerId = officer.id;
  outsiderOrgId = outsider.id;
  settledTxId = settled.id;
});

describe('M5 + chat acceptance', () => {
  it('1 — deal messages: parties and platform in, outsiders out', async () => {
    await postMessage({ id: buyerUserId, orgId: buyerOrgId, isPlatform: false }, settledTxId, 'itest: Ware angekommen, danke!');
    await postMessage({ id: officerId, orgId: null, isPlatform: true }, settledTxId, 'itest: Vorgang compliance-seitig abgeschlossen.');

    const asSeller = await listMessages(sellerOrgId, false, settledTxId);
    const bodies = asSeller.map((m) => m.body);
    expect(bodies).toContain('itest: Ware angekommen, danke!');
    expect(bodies).toContain('itest: Vorgang compliance-seitig abgeschlossen.');

    await expect(listMessages(outsiderOrgId, false, settledTxId)).rejects.toMatchObject({
      message: 'NOT_PARTY',
    });
  });

  it('2 — §18 value model: no reference ⇒ null savings; sourced reference ⇒ exact savings', async () => {
    const tx = await prisma.transaction.findUniqueOrThrow({
      where: { id: settledTxId },
      include: { listing: { select: { productId: true } } },
    });
    const productId = tx.listing!.productId;

    // Deterministic baseline: remove itest references from earlier runs.
    await prisma.pricingReference.deleteMany({
      where: { productId, sourceName: { startsWith: 'DEMO DATA — itest' } },
    });

    const without = await dealValueModel(settledTxId);
    expect(without.estimatedBuyerSavings).toBeNull();
    expect(without.referenceSource).toBeNull();

    await prisma.pricingReference.create({
      data: {
        productId,
        countryId: tx.destinationCountryId,
        priceType: 'PROCUREMENT',
        price: '15.00',
        currency: 'EUR',
        sourceName: 'DEMO DATA — itest procurement reference',
        asOf: new Date('2026-08-01T00:00:00.000Z'),
        confidence: 'MEDIUM',
      },
    });

    const withRef = await dealValueModel(settledTxId);
    const expected = new Decimal('15.00').times(tx.quantity).minus(tx.buyerLandedCost!.toString()).toFixed(2);
    expect(withRef.estimatedBuyerSavings).toBe(expected);
    expect(withRef.referenceSource?.name).toContain('itest');
  });

  it('3 — platform analytics aggregate real settled records', async () => {
    const a = await platformAnalytics();
    const tx = await prisma.transaction.findUniqueOrThrow({ where: { id: settledTxId } });

    expect(a.settledCount).toBeGreaterThanOrEqual(1);
    expect(new Decimal(a.gmv).greaterThanOrEqualTo(tx.subtotal!.toString())).toBe(true);
    expect(a.packsRedistributed).toBeGreaterThanOrEqual(tx.quantity);
    expect(a.savings.dealsWithReference).toBeGreaterThanOrEqual(1);
    expect(a.countryGmv.some((c) => c.countryId === tx.destinationCountryId)).toBe(true);
    expect(a.avgHoursToTransaction).not.toBeNull();
  });
});
