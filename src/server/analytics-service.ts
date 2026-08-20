import Decimal from 'decimal.js';
import { prisma } from '@/lib/db';

// Platform analytics (spec §46) — every number is an aggregate over REAL
// records; buyer savings are only computed against sourced price references
// (spec §17/§18: no market price → "insufficient pricing data", never invented).

export interface PlatformAnalytics {
  settledCount: number;
  gmv: string;
  platformRevenue: string;
  packsRedistributed: number;
  /** Settled packs from SHORT_DATED listings — the honest waste-avoided proxy, labeled as estimate. */
  shortDatedPacksRedistributed: number;
  avgHoursToTransaction: number | null;
  avgHoursListingToMatch: number | null;
  matchCount: number;
  transactionCount: number;
  matchConversionPercent: number | null;
  activeListings: number;
  activeDemands: number;
  verifiedOrgs: number;
  countryGmv: Array<{ countryId: string; gmv: string; count: number }>;
  productGmv: Array<{ inn: string; gmv: string; count: number }>;
  savings: {
    dealsWithReference: number;
    dealsWithoutReference: number;
    totalBuyerSavings: string | null; // null when no deal had a reference
  };
}

const hours = (ms: number) => Math.round((ms / 36e5) * 10) / 10;

export async function platformAnalytics(): Promise<PlatformAnalytics> {
  const [settled, matches, txCount, activeListings, activeDemands, verifiedOrgs, references] =
    await Promise.all([
      prisma.transaction.findMany({
        where: { state: 'SETTLED' },
        include: {
          listing: { select: { listingType: true, product: { select: { inn: true, id: true } } } },
          stateEvents: { where: { toState: 'SETTLED' }, take: 1 },
        },
      }),
      prisma.match.findMany({
        select: { createdAt: true, listing: { select: { publishedAt: true } } },
      }),
      prisma.transaction.count(),
      prisma.listing.count({ where: { status: 'ACTIVE', deletedAt: null } }),
      prisma.buyerDemand.count({ where: { status: 'ACTIVE' } }),
      prisma.organization.count({ where: { status: 'VERIFIED', deletedAt: null } }),
      prisma.pricingReference.findMany(),
    ]);

  let gmv = new Decimal(0);
  let revenue = new Decimal(0);
  let packs = 0;
  let shortDatedPacks = 0;
  const txDurations: number[] = [];
  const countryAgg = new Map<string, { gmv: Decimal; count: number }>();
  const productAgg = new Map<string, { gmv: Decimal; count: number }>();
  let savingsTotal = new Decimal(0);
  let dealsWithReference = 0;
  let dealsWithoutReference = 0;

  for (const tx of settled) {
    const subtotal = new Decimal(tx.subtotal?.toString() ?? 0);
    gmv = gmv.plus(subtotal);
    revenue = revenue.plus(tx.platformRevenue?.toString() ?? 0);
    packs += tx.quantity;
    if (tx.listing?.listingType === 'SHORT_DATED') shortDatedPacks += tx.quantity;

    const settledEvent = tx.stateEvents[0];
    if (settledEvent) txDurations.push(settledEvent.createdAt.getTime() - tx.createdAt.getTime());

    const c = countryAgg.get(tx.destinationCountryId) ?? { gmv: new Decimal(0), count: 0 };
    countryAgg.set(tx.destinationCountryId, { gmv: c.gmv.plus(subtotal), count: c.count + 1 });

    const inn = tx.listing?.product.inn ?? '—';
    const p = productAgg.get(inn) ?? { gmv: new Decimal(0), count: 0 };
    productAgg.set(inn, { gmv: p.gmv.plus(subtotal), count: p.count + 1 });

    // Savings only against a sourced reference: product+destination first,
    // then product-global — otherwise the deal counts as "no reference".
    const ref =
      references.find((r) => r.productId === tx.listing?.product.id && r.countryId === tx.destinationCountryId) ??
      references.find((r) => r.productId === tx.listing?.product.id && r.countryId === null);
    if (ref && tx.buyerLandedCost) {
      const alternative = new Decimal(ref.price.toString()).times(tx.quantity);
      savingsTotal = savingsTotal.plus(alternative.minus(tx.buyerLandedCost.toString()));
      dealsWithReference += 1;
    } else {
      dealsWithoutReference += 1;
    }
  }

  const matchDurations = matches
    .filter((m) => m.listing?.publishedAt)
    .map((m) => m.createdAt.getTime() - m.listing!.publishedAt!.getTime())
    .filter((ms) => ms >= 0);

  const sorted = (agg: Map<string, { gmv: Decimal; count: number }>) =>
    [...agg.entries()]
      .sort((a, b) => b[1].gmv.comparedTo(a[1].gmv))
      .slice(0, 10)
      .map(([key, v]) => ({ key, gmv: v.gmv.toFixed(2), count: v.count }));

  return {
    settledCount: settled.length,
    gmv: gmv.toFixed(2),
    platformRevenue: revenue.toFixed(2),
    packsRedistributed: packs,
    shortDatedPacksRedistributed: shortDatedPacks,
    avgHoursToTransaction:
      txDurations.length > 0 ? hours(txDurations.reduce((a, b) => a + b, 0) / txDurations.length) : null,
    avgHoursListingToMatch:
      matchDurations.length > 0 ? hours(matchDurations.reduce((a, b) => a + b, 0) / matchDurations.length) : null,
    matchCount: matches.length,
    transactionCount: txCount,
    matchConversionPercent: matches.length > 0 ? Math.round((txCount / matches.length) * 100) : null,
    activeListings,
    activeDemands,
    verifiedOrgs,
    countryGmv: sorted(countryAgg).map(({ key, gmv, count }) => ({ countryId: key, gmv, count })),
    productGmv: sorted(productAgg).map(({ key, gmv, count }) => ({ inn: key, gmv, count })),
    savings: {
      dealsWithReference,
      dealsWithoutReference,
      totalBuyerSavings: dealsWithReference > 0 ? savingsTotal.toFixed(2) : null,
    },
  };
}

/** §18 economics block for one transaction — savings only with a sourced reference. */
export async function dealValueModel(transactionId: string) {
  const tx = await prisma.transaction.findUniqueOrThrow({
    where: { id: transactionId },
    include: { listing: { select: { productId: true } } },
  });
  const ref = tx.listing
    ? ((await prisma.pricingReference.findFirst({
        where: { productId: tx.listing.productId, countryId: tx.destinationCountryId },
      })) ??
      (await prisma.pricingReference.findFirst({
        where: { productId: tx.listing.productId, countryId: null },
      })))
    : null;

  const savings =
    ref && tx.buyerLandedCost
      ? new Decimal(ref.price.toString()).times(tx.quantity).minus(tx.buyerLandedCost.toString()).toFixed(2)
      : null;

  return {
    sellerRecovery: tx.sellerPayout?.toString() ?? null,
    platformRevenue: tx.platformRevenue?.toString() ?? null,
    buyerLandedCost: tx.buyerLandedCost?.toString() ?? null,
    referenceSource: ref ? { name: ref.sourceName, price: ref.price.toString(), confidence: ref.confidence } : null,
    estimatedBuyerSavings: savings, // null ⇒ UI renders "insufficient pricing data"
  };
}
