/**
 * M3 acceptance criteria (docs/architecture/J-mvp-roadmap.md) against the real
 * database:
 *
 *  1. Rule versions are NEVER overwritten: publishing supersedes (old version
 *     stays, marked OUTDATED, chained via supersedesVersionId) and immediately
 *     re-evaluates open listings — verdicts flip with the rule and flip back.
 *  2. An unverified country can never be trade-enabled.
 *  3. A recall makes a batch instantly untradable: open listing → BLOCKED,
 *     new listings refused.
 *  4. Sanctions screening updates the org and is audited.
 *  5. Platform config is DB-driven with cache invalidation.
 *
 * Requires: docker compose up -d && npm run db:migrate && npm run db:seed
 * (Runs after m2-acceptance.itest.ts; both are rerun-safe.)
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { draftRuleVersion, publishRuleVersion } from '@/server/rule-service';
import { setCountryTradeStatus } from '@/server/country-service';
import { createRecall } from '@/server/recall-service';
import { createListing } from '@/server/listing-service';
import { recordSanctionsCheck } from '@/server/sanctions-service';
import { getConfig, invalidateConfigCache } from '@/lib/config/platform-config';
import type { CurrentUser } from '@/lib/auth/current';

let officerId: string;
let adminId: string;
let analystId: string;
let sellerUser: CurrentUser;
let amoxListingId: string;

async function zzVerdictFor(listingId: string): Promise<string> {
  const row = await prisma.listingEligibility.findUnique({
    where: { listingId_countryId: { listingId, countryId: 'ZZ' } },
  });
  return row?.verdict ?? 'MISSING';
}

beforeAll(async () => {
  const [officer, admin, analyst, seller] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { email: 'compliance@demo.pharmabridge.local' } }),
    prisma.user.findUniqueOrThrow({ where: { email: 'admin@demo.pharmabridge.local' } }),
    prisma.user.findUniqueOrThrow({ where: { email: 'analyst@demo.pharmabridge.local' } }),
    prisma.user.findUniqueOrThrow({
      where: { email: 'seller@demo.pharmabridge.local' },
      include: { memberships: { include: { org: true } } },
    }),
  ]);
  officerId = officer.id;
  adminId = admin.id;
  analystId = analyst.id;
  const org = seller.memberships[0]!.org;
  sellerUser = {
    id: seller.id,
    email: seller.email,
    firstName: 'itest',
    lastName: 'itest',
    locale: 'de',
    platformRole: null,
    org: org as CurrentUser['org'],
    orgRole: 'OWNER',
  };

  const amoxListing = await prisma.listing.findFirstOrThrow({
    where: { batch: { lotNumber: 'DEMO-LOT-2506' }, deletedAt: null },
    orderBy: { createdAt: 'asc' },
  });
  amoxListingId = amoxListing.id;
});

describe('M3 acceptance', () => {
  it('1 — publishing a rule version supersedes without overwriting and re-evaluates listings (verdicts flip and flip back)', async () => {
    const rule = await prisma.regulatoryRule.findFirstOrThrow({
      where: { countryId: 'ZZ', ruleType: 'SHELF_LIFE' },
    });
    const before = await prisma.regulatoryRuleVersion.findMany({ where: { ruleId: rule.id } });
    const previousCurrentId = rule.currentVersionId!;

    // Draft (analyst) — strict rule the Amoxicillin batch cannot satisfy (~21.7 months at arrival).
    const strict = await draftRuleVersion(analystId, {
      countryId: 'ZZ',
      ruleType: 'SHELF_LIFE',
      payload: { kind: 'ABSOLUTE_MONTHS', minMonths: 30 },
      sourceName: 'DEMO DATA — itest strict variant',
      confidence: 'HIGH',
    });
    const drafted = await prisma.regulatoryRuleVersion.findUniqueOrThrow({ where: { id: strict.ruleVersionId } });
    expect(drafted.status).toBe('PENDING_VERIFICATION');
    expect(drafted.supersedesVersionId).toBe(previousCurrentId);

    // Publish (officer) → re-evaluation flips the verdict.
    const published = await publishRuleVersion(officerId, strict.ruleVersionId);
    expect(published.reevaluatedListings).toBeGreaterThan(0);

    const ruleAfter = await prisma.regulatoryRule.findUniqueOrThrow({ where: { id: rule.id } });
    expect(ruleAfter.currentVersionId).toBe(strict.ruleVersionId);
    const oldVersion = await prisma.regulatoryRuleVersion.findUniqueOrThrow({ where: { id: previousCurrentId } });
    expect(oldVersion.status).toBe('OUTDATED'); // superseded, never deleted or edited away

    expect(await zzVerdictFor(amoxListingId)).toBe('INELIGIBLE');
    const elig = await prisma.listingEligibility.findUniqueOrThrow({
      where: { listingId_countryId: { listingId: amoxListingId, countryId: 'ZZ' } },
    });
    expect(JSON.stringify(elig.reasons)).toContain('SHELF_LIFE_BELOW_MIN_MONTHS');
    expect(elig.ruleVersionIds as string[]).toContain(strict.ruleVersionId);

    // Restore the demo semantics with ANOTHER version (never by editing).
    const restore = await draftRuleVersion(analystId, {
      countryId: 'ZZ',
      ruleType: 'SHELF_LIFE',
      payload: { kind: 'COMBINED_RULE', minMonths: 12, minPercent: 50, combinator: 'WHICHEVER_GREATER' },
      sourceName: 'DEMO DATA — fictional country, no real-world claim',
      confidence: 'HIGH',
    });
    await publishRuleVersion(officerId, restore.ruleVersionId);
    expect(await zzVerdictFor(amoxListingId)).toBe('CONDITIONALLY_ELIGIBLE');

    // The complete history grew — nothing was overwritten.
    const after = await prisma.regulatoryRuleVersion.findMany({ where: { ruleId: rule.id } });
    expect(after.length).toBe(before.length + 2);
    for (const v of before) {
      expect(after.some((x) => x.id === v.id)).toBe(true);
    }
  });

  it('2 — an unverified country can never be trade-enabled', async () => {
    await expect(setCountryTradeStatus(adminId, 'KE', 'TRADE_ENABLED')).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'COUNTRY_RULES_NOT_VERIFIED',
    });
    const ke = await prisma.country.findUniqueOrThrow({ where: { id: 'KE' } });
    expect(ke.tradeStatus).toBe('NOT_TRADE_ENABLED');
  });

  it('3 — a recall makes the batch instantly untradable (listing BLOCKED, new listings refused)', async () => {
    const batch = await prisma.batch.findFirstOrThrow({
      where: { lotNumber: 'DEMO-LOT-2411' },
      include: { position: true },
    });

    if (batch.recallStatus === 'NONE') {
      // Ensure an ACTIVE listing exists so the cascade is observable.
      let listing = await prisma.listing.findFirst({
        where: { batchId: batch.id, status: { in: ['DRAFT', 'PENDING_COMPLIANCE', 'ACTIVE', 'PAUSED'] }, deletedAt: null },
      });
      if (!listing) {
        const available = (batch.position?.onHand ?? batch.quantity) - (batch.position?.reserved ?? 0);
        const created = await createListing(sellerUser, {
          batchId: batch.id,
          quantity: available,
          minOrderQuantity: 100,
          unitPrice: '9.90',
          currency: 'EUR',
          negotiable: true,
          visibility: 'PUBLIC_VERIFIED',
          anonymousSeller: false,
        });
        listing = await prisma.listing.findUniqueOrThrow({ where: { id: created.listingId } });
      }

      const result = await createRecall(officerId, {
        batchIds: [batch.id],
        scope: 'itest: demonstration recall — packaging defect',
        sourceName: 'DEMO DATA',
      });
      expect(result.blockedListings).toBeGreaterThanOrEqual(1);
    }

    const batchAfter = await prisma.batch.findUniqueOrThrow({ where: { id: batch.id } });
    expect(batchAfter.recallStatus).toBe('RECALLED');

    const openListings = await prisma.listing.count({
      where: { batchId: batch.id, status: { in: ['DRAFT', 'PENDING_COMPLIANCE', 'ACTIVE', 'PAUSED'] }, deletedAt: null },
    });
    expect(openListings).toBe(0);

    await expect(
      createListing(sellerUser, {
        batchId: batch.id,
        quantity: 100,
        minOrderQuantity: 10,
        unitPrice: '9.90',
        currency: 'EUR',
        negotiable: true,
        visibility: 'PUBLIC_VERIFIED',
        anonymousSeller: false,
      }),
    ).rejects.toMatchObject({ message: 'BATCH_RECALLED' });
  });

  it('4 — sanctions screening updates the organization and is audited', async () => {
    const org = await prisma.organization.findFirstOrThrow({
      where: { legalName: { contains: 'Nairobi Med Imports' } },
    });
    await recordSanctionsCheck(officerId, { orgId: org.id, result: 'REVIEW', note: 'itest: manual screening' });
    const after = await prisma.organization.findUniqueOrThrow({ where: { id: org.id } });
    expect(after.sanctionsStatus).toBe('REVIEW');

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'SANCTIONS_CHECK_RECORDED', entityId: org.id },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit).not.toBeNull();

    await recordSanctionsCheck(officerId, { orgId: org.id, result: 'CLEAR', note: 'itest: restored' });
  });

  it('5 — platform config is DB-driven with cache invalidation', async () => {
    invalidateConfigCache();
    const original = await getConfig('seller_commission_percent');

    await prisma.platformConfig.upsert({
      where: { key: 'seller_commission_percent' },
      update: { value: 7 },
      create: { key: 'seller_commission_percent', value: 7 },
    });
    invalidateConfigCache();
    expect(await getConfig('seller_commission_percent')).toBe(7);

    await prisma.platformConfig.update({ where: { key: 'seller_commission_percent' }, data: { value: original } });
    invalidateConfigCache();
    expect(await getConfig('seller_commission_percent')).toBe(original);
  });
});
