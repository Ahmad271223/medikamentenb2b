import type { BuyerDemand, Listing, ListingEligibility } from '@prisma/client';
import { prisma } from '@/lib/db';
import { computeMatchScore } from '@/domain/matching/score';
import {
  deriveDemandStrength,
  deriveLogisticsFeasibility,
  derivePriceCompetitiveness,
  deriveShelfLifeComfort,
  NEUTRAL_RELIABILITY,
} from '@/domain/matching/derive';
import { notifyOrgOwners } from './notify';
import { writeAudit } from '@/lib/audit/audit';

// Matches supply ↔ demand in both directions (spec §58). MVP matches on exact
// product identity; free-text demands are matched by humans, never by guessing.

async function matchPair(
  listing: Listing & { eligibilities: ListingEligibility[] },
  demand: BuyerDemand,
): Promise<boolean> {
  if (listing.sellerOrgId === demand.buyerOrgId) return false;

  // Visibility gate mirrors the marketplace: restricted listings never match
  // demands their buyer could not see.
  if (listing.visibility === 'PRIVATE') return false;
  if (listing.visibility === 'INVITE_ONLY') {
    const invite = await prisma.listingInvite.findUnique({
      where: { listingId_buyerOrgId: { listingId: listing.id, buyerOrgId: demand.buyerOrgId } },
    });
    if (!invite) return false;
  }
  if (
    listing.visibility === 'COUNTRY_RESTRICTED' &&
    !listing.restrictedToCountryIds.includes(demand.destinationCountryId)
  ) {
    return false;
  }

  const eligibility = listing.eligibilities.find((e) => e.countryId === demand.destinationCountryId);
  if (!eligibility) return false;
  if (eligibility.verdict !== 'ELIGIBLE' && eligibility.verdict !== 'CONDITIONALLY_ELIGIBLE') return false;

  const score = computeMatchScore({
    verdict: eligibility.verdict,
    demandStrength: deriveDemandStrength(demand.quantity, listing.quantityAvailable),
    priceCompetitiveness: derivePriceCompetitiveness(
      Number(listing.unitPrice),
      demand.maxUnitPrice === null ? null : Number(demand.maxUnitPrice),
    ),
    shelfLifeComfort: deriveShelfLifeComfort(
      eligibility.arrivalShelfLifeDays ?? 0,
      demand.minRemainingShelfLifeMonths,
    ),
    logisticsFeasibility: deriveLogisticsFeasibility(
      eligibility.projectedArrivalDate ?? new Date(),
      demand.requiredBy,
    ),
    counterpartyReliability: NEUTRAL_RELIABILITY,
  });
  if (score.gated) return false;

  const existing = await prisma.match.findUnique({
    where: { listingId_demandId: { listingId: listing.id, demandId: demand.id } },
  });
  if (existing) {
    await prisma.match.update({
      where: { id: existing.id },
      data: {
        score: score.score,
        scoreBreakdown: score.breakdown,
        eligibilitySnapshot: { verdict: eligibility.verdict, evaluatedAt: eligibility.evaluatedAt },
      },
    });
    return false;
  }

  await prisma.match.create({
    data: {
      listingId: listing.id,
      demandId: demand.id,
      batchId: listing.batchId,
      sellerOrgId: listing.sellerOrgId,
      buyerOrgId: demand.buyerOrgId,
      score: score.score,
      scoreBreakdown: score.breakdown,
      eligibilitySnapshot: { verdict: eligibility.verdict, evaluatedAt: eligibility.evaluatedAt },
    },
  });
  await Promise.all([
    notifyOrgOwners(demand.buyerOrgId, {
      type: 'MATCH_NEW',
      title: 'Neue Übereinstimmung / New match',
      body: `Score ${score.score}/100`,
      data: { listingId: listing.id, demandId: demand.id },
    }),
    notifyOrgOwners(listing.sellerOrgId, {
      type: 'MATCH_NEW',
      title: 'Neue Nachfrage-Übereinstimmung / New demand match',
      body: `Score ${score.score}/100`,
      data: { listingId: listing.id, demandId: demand.id },
    }),
    writeAudit({
      actorType: 'SYSTEM',
      action: 'MATCH_CREATED',
      entityType: 'Match',
      entityId: `${listing.id}:${demand.id}`,
      newValue: { score: score.score, country: demand.destinationCountryId },
    }),
  ]);
  return true;
}

export async function runMatchingForListing(listingId: string): Promise<number> {
  const listing = await prisma.listing.findUnique({
    where: { id: listingId, status: 'ACTIVE' },
    include: { eligibilities: true },
  });
  if (!listing) return 0;
  const demands = await prisma.buyerDemand.findMany({
    where: { status: 'ACTIVE', productId: listing.productId },
  });
  let created = 0;
  for (const demand of demands) {
    if (await matchPair(listing, demand)) created += 1;
  }
  return created;
}

export async function runMatchingForDemand(demandId: string): Promise<number> {
  const demand = await prisma.buyerDemand.findUnique({ where: { id: demandId, status: 'ACTIVE' } });
  if (!demand || !demand.productId) return 0;
  const listings = await prisma.listing.findMany({
    where: { status: 'ACTIVE', productId: demand.productId, deletedAt: null },
    include: { eligibilities: true },
  });
  let created = 0;
  for (const listing of listings) {
    if (await matchPair(listing, demand)) created += 1;
  }
  return created;
}
