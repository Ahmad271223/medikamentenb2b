import { prisma } from '@/lib/db';

// Single source of the eligibility-filtered marketplace query — used by the
// API route and the server-rendered page alike (spec §16: a buyer generally
// never sees inventory they cannot legally purchase).

export interface MarketplaceQuery {
  q?: string;
  listingType?: 'SURPLUS' | 'SHORT_DATED';
  maxUnitPrice?: number;
  minShelfMonths?: number;
}

const AVERAGE_DAYS_PER_MONTH = 30.44;

export async function searchMarketplace(orgId: string, params: MarketplaceQuery) {
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
  if (org.status !== 'VERIFIED') {
    return { verifiedRequired: true as const, buyerCountryId: null, items: [] };
  }

  const listings = await prisma.listing.findMany({
    where: {
      status: 'ACTIVE',
      deletedAt: null,
      // Visibility gate: PUBLIC to all verified buyers; COUNTRY_RESTRICTED only
      // to buyers in an allowed destination; INVITE_ONLY only to explicitly
      // invited buyer orgs; PRIVATE never surfaces in search.
      OR: [
        { visibility: 'PUBLIC_VERIFIED' },
        { visibility: 'COUNTRY_RESTRICTED', restrictedToCountryIds: { has: org.countryId } },
        { visibility: 'INVITE_ONLY', invites: { some: { buyerOrgId: org.id } } },
      ],
      sellerOrgId: { not: org.id },
      eligibilities: {
        some: { countryId: org.countryId, verdict: { in: ['ELIGIBLE', 'CONDITIONALLY_ELIGIBLE'] } },
      },
      ...(params.listingType ? { listingType: params.listingType } : {}),
      ...(params.maxUnitPrice ? { unitPrice: { lte: params.maxUnitPrice } } : {}),
      ...(params.q
        ? {
            product: {
              OR: [
                { inn: { contains: params.q, mode: 'insensitive' } },
                { brandName: { contains: params.q, mode: 'insensitive' } },
                { atcCode: { contains: params.q, mode: 'insensitive' } },
              ],
            },
          }
        : {}),
    },
    include: {
      product: true,
      batch: { select: { expiryDate: true, lotNumber: true, temperatureMode: true } },
      sellerOrg: { select: { legalName: true, countryId: true } },
      eligibilities: { where: { countryId: org.countryId } },
    },
    orderBy: { publishedAt: 'desc' },
    take: 100,
  });

  const items = listings
    .map((l) => {
      const eligibility = l.eligibilities[0];
      return {
        id: l.id,
        listingType: l.listingType,
        product: {
          inn: l.product.inn,
          brandName: l.product.brandName,
          atcCode: l.product.atcCode,
          dosageForm: l.product.dosageForm,
          strengthValue: l.product.strengthValue?.toString() ?? null,
          strengthUnit: l.product.strengthUnit,
        },
        quantityAvailable: l.quantityAvailable,
        minOrderQuantity: l.minOrderQuantity,
        unitPrice: l.unitPrice.toString(),
        currency: l.currency,
        negotiable: l.negotiable,
        incoterm: l.incoterm,
        expiryDate: l.batch.expiryDate,
        temperatureMode: l.batch.temperatureMode,
        originCountryId: l.sellerOrg.countryId,
        // Anonymous-seller mode hides the identity, never the verification state.
        sellerName: l.anonymousSeller ? null : l.sellerOrg.legalName,
        isDemo: l.isDemo,
        eligibility: eligibility
          ? {
              verdict: eligibility.verdict,
              arrivalShelfLifeDays: eligibility.arrivalShelfLifeDays,
              arrivalShelfLifePercent: eligibility.arrivalShelfLifePercent?.toString() ?? null,
              requiredPermits: eligibility.requiredPermits,
              requiredDocuments: eligibility.requiredDocuments,
            }
          : null,
      };
    })
    .filter((item) => {
      if (!params.minShelfMonths) return true;
      const days = item.eligibility?.arrivalShelfLifeDays ?? 0;
      return days >= params.minShelfMonths * AVERAGE_DAYS_PER_MONTH;
    });

  return { verifiedRequired: false as const, buyerCountryId: org.countryId, items };
}

export type MarketplaceItem = Awaited<ReturnType<typeof searchMarketplace>>['items'][number];
