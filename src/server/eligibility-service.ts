import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { getConfig } from '@/lib/config/platform-config';
import { evaluateBatchForDestination, ELIGIBILITY_ENGINE_VERSION } from '@/domain/eligibility/engine';
import type { EligibilityInput, ShelfLifeRuleSnapshot } from '@/domain/eligibility/types';

// Assembles database state into engine snapshots and persists the verdicts.
// The engine itself stays pure — this is the only place that feeds it.

interface ImportRulePayload {
  permitRequired?: boolean;
  requiredDocumentCodes?: string[];
}

/**
 * Regulatory inputs changed (rule published, country status switched,
 * sanctions updated) — every open listing's verdict snapshots are stale and
 * must be recomputed. Sequential by design: correctness over speed at MVP scale.
 */
export async function reevaluateActiveListings(): Promise<number> {
  const listings = await prisma.listing.findMany({
    where: { deletedAt: null, status: { in: ['DRAFT', 'PENDING_COMPLIANCE', 'ACTIVE', 'PAUSED'] } },
    select: { id: true },
  });
  for (const listing of listings) {
    await evaluateListingEligibility(listing.id);
  }
  return listings.length;
}

export async function evaluateListingEligibility(listingId: string): Promise<Record<string, number>> {
  const listing = await prisma.listing.findUniqueOrThrow({
    where: { id: listingId },
    include: { batch: true, product: true, sellerOrg: { include: { licenses: true } } },
  });

  const [countries, shelfRules, importRules, registrations, sellerSanctions, verifiedDocs, config] =
    await Promise.all([
      prisma.country.findMany(),
      prisma.regulatoryRule.findMany({ where: { ruleType: 'SHELF_LIFE' }, include: { currentVersion: true } }),
      prisma.regulatoryRule.findMany({ where: { ruleType: 'IMPORT_LICENSE' }, include: { currentVersion: true } }),
      prisma.productCountryRegistration.findMany({ where: { productId: listing.productId } }),
      prisma.sanctionsCheck.findFirst({
        where: { subjectType: 'ORGANIZATION', subjectId: listing.sellerOrgId },
        orderBy: { checkedAt: 'desc' },
      }),
      prisma.document.findMany({
        where: { batchId: listing.batchId, status: 'VERIFIED', deletedAt: null },
        select: { type: true },
      }),
      Promise.all([
        getConfig('excluded_controlled_statuses'),
        getConfig('allow_cold_chain'),
        getConfig('sanctions_max_age_days'),
        getConfig('default_shipping_days'),
        getConfig('default_customs_buffer_days'),
        getConfig('default_operational_buffer_days'),
      ]),
    ]);

  const [excluded, allowColdChain, sanctionsMaxAge, defShip, defCustoms, defOps] = config;
  const registrationByCountry = new Map(registrations.map((r) => [r.countryId, r.status]));
  const today = new Date();
  const counts: Record<string, number> = {};

  for (const country of countries) {
    const shelfVersion = shelfRules.find((r) => r.countryId === country.id)?.currentVersion ?? null;
    const importVersion = importRules.find((r) => r.countryId === country.id)?.currentVersion ?? null;
    const importPayload = (importVersion?.payload as ImportRulePayload | null) ?? null;

    const input: EligibilityInput = {
      today,
      batch: {
        id: listing.batch.id,
        expiryDate: listing.batch.expiryDate,
        manufacturingDate: listing.batch.manufacturingDate,
        originalShelfLifeMonths: listing.product.originalShelfLifeMonths,
        quantity: listing.batch.quantity,
        recallStatus: listing.batch.recallStatus,
        quarantineStatus: listing.batch.quarantineStatus,
        qualityStatus: listing.batch.qualityStatus,
      },
      product: {
        id: listing.product.id,
        status: listing.product.status,
        atcCode: listing.product.atcCode,
        dosageForm: listing.product.dosageForm,
        controlledStatus: listing.product.controlledStatus,
        coldChain: listing.product.coldChain,
        temperatureMode: listing.batch.temperatureMode,
        serializationRequired: listing.product.serializationRequired,
      },
      seller: {
        id: listing.sellerOrg.id,
        status: listing.sellerOrg.status,
        sanctionsResult: listing.sellerOrg.sanctionsStatus,
        sanctionsCheckedAt: sellerSanctions?.checkedAt ?? null,
        licenses: listing.sellerOrg.licenses.map((l) => ({
          type: l.type,
          status: l.status,
          expiryDate: l.expiryDate,
        })),
      },
      buyer: null, // country-level snapshots; buyer-specific checks re-run at offer/compliance time
      destination: {
        countryId: country.id,
        tradeStatus: country.tradeStatus,
        productRegistration: registrationByCountry.get(country.id) ?? 'UNKNOWN',
        shelfLifeRule: shelfVersion
          ? ({ id: shelfVersion.id, status: shelfVersion.status, payload: shelfVersion.payload } as ShelfLifeRuleSnapshot)
          : null,
        importPermitRequired: importPayload?.permitRequired ?? null,
        requiredDocumentCodes: importPayload?.requiredDocumentCodes ?? [],
        shippingDays: country.shippingDays ?? defShip,
        customsBufferDays: country.customsBufferDays ?? defCustoms,
        operationalBufferDays: country.operationalBufferDays ?? defOps,
      },
      availableDocumentCodes: verifiedDocs.map((doc) => doc.type),
      config: {
        excludedControlledStatuses: excluded,
        allowColdChain,
        sanctionsMaxAgeDays: sanctionsMaxAge,
        engineVersion: ELIGIBILITY_ENGINE_VERSION,
      },
    };

    const result = evaluateBatchForDestination(input);
    counts[result.verdict] = (counts[result.verdict] ?? 0) + 1;

    const data = {
      verdict: result.verdict,
      reasons: result.reasons as unknown as Prisma.InputJsonValue,
      requiredDocuments: result.requiredDocuments,
      requiredPermits: result.requiredPermits,
      projectedArrivalDate: result.projectedArrivalDate,
      arrivalShelfLifeDays: result.arrivalShelfLifeDays,
      arrivalShelfLifePercent: result.arrivalShelfLifePercent,
      requiresHumanReview: result.requiresHumanReview,
      engineVersion: result.engineVersion,
      ruleVersionIds: result.ruleVersionIds,
      evaluatedAt: new Date(),
    };
    await prisma.listingEligibility.upsert({
      where: { listingId_countryId: { listingId: listing.id, countryId: country.id } },
      update: data,
      create: { listingId: listing.id, countryId: country.id, ...data },
    });
  }

  return counts;
}
