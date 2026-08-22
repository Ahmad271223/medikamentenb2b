import type { CountryTradeStatus, Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { ApiError } from '@/lib/errors';
import { writeAudit } from '@/lib/audit/audit';
import { reevaluateActiveListings } from './eligibility-service';

/**
 * Country research pipeline, step 13 (spec §52): a country becomes tradable
 * only after verified rules exist. Software enforces the minimum gate — the
 * legal/compliance review behind it is a human responsibility.
 */
export async function setCountryTradeStatus(
  userId: string,
  countryId: string,
  tradeStatus: CountryTradeStatus,
) {
  const country = await prisma.country.findUnique({ where: { id: countryId } });
  if (!country) throw new ApiError('NOT_FOUND', 404, 'COUNTRY_NOT_FOUND');
  if (country.tradeStatus === tradeStatus) return { tradeStatus };

  if (tradeStatus === 'TRADE_ENABLED') {
    const verifiedShelfLife = await prisma.regulatoryRule.count({
      where: { countryId, ruleType: 'SHELF_LIFE', currentVersion: { status: 'VERIFIED' } },
    });
    if (verifiedShelfLife === 0) {
      throw new ApiError('CONFLICT', 409, 'COUNTRY_RULES_NOT_VERIFIED');
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.country.update({ where: { id: countryId }, data: { tradeStatus } });
    await writeAudit(
      {
        actorUserId: userId,
        action: 'COUNTRY_TRADE_STATUS_CHANGED',
        entityType: 'Country',
        entityId: countryId,
        oldValue: { tradeStatus: country.tradeStatus },
        newValue: { tradeStatus },
      },
      tx,
    );
  });

  const reevaluated = await reevaluateActiveListings();
  return { tradeStatus, reevaluatedListings: reevaluated };
}

// ── Country readiness (spec §30) — data-backed components only. ───────────
// Dimensions without data are listed as NOT ASSESSED and excluded from the
// total; uncertainty is shown, never hidden behind a fabricated number.

interface AssessedComponent {
  key: string;
  score: number;
  note: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
}

const NOT_ASSESSED = [
  'partnerAvailability',
  'paymentRisk',
  'sanctionsComplexity',
  'customsPredictability',
  'commercialAttractiveness',
] as const;

export async function computeCountryReadiness(userId: string, countryId: string) {
  const country = await prisma.country.findUnique({ where: { id: countryId } });
  if (!country) throw new ApiError('NOT_FOUND', 404, 'COUNTRY_NOT_FOUND');

  const [rules, verifiedProducts, knownRegistrations, activeDemands] = await Promise.all([
    prisma.regulatoryRule.findMany({ where: { countryId }, include: { currentVersion: true } }),
    prisma.product.count({ where: { status: 'VERIFIED', deletedAt: null } }),
    prisma.productCountryRegistration.count({
      where: { countryId, status: { in: ['REGISTERED', 'NOT_REGISTERED'] } },
    }),
    prisma.buyerDemand.count({ where: { destinationCountryId: countryId, status: 'ACTIVE' } }),
  ]);

  const verifiedTypes = rules
    .filter((r) => r.currentVersion?.status === 'VERIFIED')
    .map((r) => r.ruleType);
  const coreTypes = ['SHELF_LIFE', 'IMPORT_LICENSE', 'PRODUCT_REGISTRATION'];
  const coreVerified = coreTypes.filter((tRule) => verifiedTypes.includes(tRule as never));

  const assessed: AssessedComponent[] = [
    {
      key: 'regulatoryClarity',
      score: Math.round((coreVerified.length / coreTypes.length) * 100),
      note: `verified core rules: ${coreVerified.join(', ') || 'none'}`,
      confidence: 'HIGH',
    },
    {
      key: 'tradeReadiness',
      score: country.tradeStatus === 'TRADE_ENABLED' ? 100 : country.tradeStatus === 'RESEARCH_IN_PROGRESS' ? 40 : 0,
      note: `tradeStatus=${country.tradeStatus}`,
      confidence: 'HIGH',
    },
    {
      key: 'registrationCoverage',
      score: verifiedProducts === 0 ? 0 : Math.round((knownRegistrations / verifiedProducts) * 100),
      note: `${knownRegistrations}/${verifiedProducts} verified products with known registration status`,
      confidence: 'MEDIUM',
    },
    {
      key: 'demandActivity',
      score: Math.min(100, activeDemands * 25),
      note: `${activeDemands} active RFQs targeting this country`,
      confidence: 'MEDIUM',
    },
    {
      key: 'logisticsConfigured',
      score: country.shippingDays != null && country.customsBufferDays != null ? 100 : 0,
      note:
        country.shippingDays != null
          ? `buffers configured (${country.shippingDays}+${country.customsBufferDays}+${country.operationalBufferDays ?? '—'} days)`
          : 'no country-specific buffers — platform defaults apply',
      confidence: 'HIGH',
    },
  ];

  const total = Math.round(assessed.reduce((sum, c) => sum + c.score, 0) / assessed.length);

  const latest = await prisma.countryReadinessScore.findFirst({
    where: { countryId },
    orderBy: { computedAt: 'desc' },
    select: { version: true },
  });
  const score = await prisma.countryReadinessScore.create({
    data: {
      countryId,
      total,
      components: { assessed, notAssessed: [...NOT_ASSESSED] } as unknown as Prisma.InputJsonValue,
      version: (latest?.version ?? 0) + 1,
      computedBy: userId,
    },
  });
  await writeAudit({
    actorUserId: userId,
    action: 'COUNTRY_READINESS_COMPUTED',
    entityType: 'CountryReadinessScore',
    entityId: score.id,
    newValue: { countryId, total, version: score.version },
  });

  return { total, assessed, notAssessed: [...NOT_ASSESSED], version: score.version };
}


// ── Platform scope (founder decision, NOT a regulatory statement) ───────────
// Which countries may register on the supply (seller) or destination (buyer)
// side. Independent of trade enablement: a destination in scope still needs
// verified rules before anything becomes tradable.
export async function setCountryScope(
  userId: string,
  countryId: string,
  scope: { isSupplyEnabled?: boolean; isDestinationEnabled?: boolean },
) {
  const country = await prisma.country.findUnique({ where: { id: countryId } });
  if (!country) throw new ApiError('NOT_FOUND', 404, 'COUNTRY_NOT_FOUND');
  const next = {
    isSupplyEnabled: scope.isSupplyEnabled ?? country.isSupplyEnabled,
    isDestinationEnabled: scope.isDestinationEnabled ?? country.isDestinationEnabled,
  };
  if (next.isSupplyEnabled === country.isSupplyEnabled && next.isDestinationEnabled === country.isDestinationEnabled) {
    return { ...next, reevaluatedListings: 0 };
  }
  await prisma.$transaction(async (tx) => {
    await tx.country.update({ where: { id: countryId }, data: next });
    await writeAudit(
      {
        actorUserId: userId,
        action: 'COUNTRY_SCOPE_CHANGED',
        entityType: 'Country',
        entityId: countryId,
        oldValue: { isSupplyEnabled: country.isSupplyEnabled, isDestinationEnabled: country.isDestinationEnabled },
        newValue: next,
      },
      tx,
    );
  });
  // Destination scope feeds the per-country eligibility snapshots of open listings.
  const reevaluated = await reevaluateActiveListings();
  return { ...next, reevaluatedListings: reevaluated };
}
