import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';

// Single source of the eligibility-filtered marketplace query — used by the
// classic marketplace page, the modern "Arzneimittel entdecken" page and the
// API route alike (a buyer generally never sees inventory they cannot legally buy).

export interface MarketplaceQuery {
  q?: string;
  listingType?: 'SURPLUS' | 'SHORT_DATED';
  maxUnitPrice?: number;
  minUnitPrice?: number;
  minShelfMonths?: number;
  /** ATC prefixes for therapeutic-category filtering (e.g. ['J01'] for antibiotics). */
  atcPrefixes?: string[];
  manufacturer?: string;
  originCountryId?: string;
  dosageForm?: string;
  temperatureMode?: string;
  sort?: 'newest' | 'price_asc' | 'price_desc' | 'shelf_desc';
}

const AVERAGE_DAYS_PER_MONTH = 30.44;

export async function searchMarketplace(orgId: string, params: MarketplaceQuery) {
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
  if (org.status !== 'VERIFIED') {
    return { verifiedRequired: true as const, buyerCountryId: null, items: [] };
  }

  const productAnd: Record<string, unknown>[] = [];
  if (params.q) {
    productAnd.push({
      OR: [
        { inn: { contains: params.q, mode: 'insensitive' } },
        { brandName: { contains: params.q, mode: 'insensitive' } },
        { atcCode: { contains: params.q, mode: 'insensitive' } },
        { manufacturer: { name: { contains: params.q, mode: 'insensitive' } } },
        { identifiers: { some: { type: 'PZN', value: { contains: params.q.replace(/\s/g, '') } } } },
      ],
    });
  }
  if (params.atcPrefixes?.length) {
    productAnd.push({ OR: params.atcPrefixes.map((p) => ({ atcCode: { startsWith: p, mode: 'insensitive' } })) });
  }
  if (params.manufacturer) {
    productAnd.push({ manufacturer: { name: { contains: params.manufacturer, mode: 'insensitive' } } });
  }
  if (params.dosageForm) {
    productAnd.push({ dosageForm: { contains: params.dosageForm, mode: 'insensitive' } });
  }

  const listings = await prisma.listing.findMany({
    where: {
      status: 'ACTIVE',
      deletedAt: null,
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
      ...(params.minUnitPrice ? { unitPrice: { gte: params.minUnitPrice } } : {}),
      ...(params.originCountryId ? { sellerOrg: { countryId: params.originCountryId } } : {}),
      ...(params.temperatureMode ? { batch: { temperatureMode: params.temperatureMode as never } } : {}),
      ...(productAnd.length ? { product: { AND: productAnd } } : {}),
    },
    include: {
      product: {
        include: { manufacturer: { select: { name: true } }, identifiers: { where: { type: 'PZN' }, take: 1 } },
      },
      batch: { select: { expiryDate: true, lotNumber: true, temperatureMode: true } },
      sellerOrg: { select: { legalName: true, countryId: true } },
      eligibilities: { where: { countryId: org.countryId } },
    },
    orderBy: { publishedAt: 'desc' },
    take: 120,
  });

  let items = listings
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
          packSize: l.product.packSize,
          packUnit: l.product.packUnit,
          prescriptionStatus: l.product.prescriptionStatus,
          coldChain: l.product.coldChain,
          manufacturer: l.product.manufacturer?.name ?? l.product.mahName ?? null,
          pzn: l.product.identifiers[0]?.value ?? null,
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

  // Money is compared as Decimal, never as float (hard rule 3).
  if (params.sort === 'price_asc' || params.sort === 'price_desc') {
    const dir = params.sort === 'price_asc' ? 1 : -1;
    items = items.sort((a, b) => dir * new Prisma.Decimal(a.unitPrice).cmp(b.unitPrice));
  } else if (params.sort === 'shelf_desc')
    items = items.sort(
      (a, b) => (b.expiryDate?.getTime() ?? 0) - (a.expiryDate?.getTime() ?? 0),
    );

  return { verifiedRequired: false as const, buyerCountryId: org.countryId, items };
}

export type MarketplaceItem = Awaited<ReturnType<typeof searchMarketplace>>['items'][number];
