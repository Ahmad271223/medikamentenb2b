import { prisma } from '@/lib/db';
import { ApiError } from '@/lib/errors';
import { writeAudit } from '@/lib/audit/audit';
import { getConfig } from '@/lib/config/platform-config';
import { meetsMinimumMonths } from '@/domain/shelf-life/shelf-life';
import { evaluateListingEligibility } from './eligibility-service';
import { runMatchingForListing } from './matching-service';
import type { CurrentUser } from '@/lib/auth/current';

const SELLER_TRADE_LICENSES = ['WDA', 'WHOLESALE', 'MANUFACTURING', 'PHARMACY', 'HOSPITAL'];
const OPEN_LISTING_STATUSES = ['DRAFT', 'PENDING_COMPLIANCE', 'ACTIVE', 'PAUSED'] as const;

export interface CreateListingInput {
  batchId: string;
  quantity: number;
  minOrderQuantity: number;
  unitPrice: string;
  currency: string;
  negotiable: boolean;
  incoterm?: string;
  visibility: 'PUBLIC_VERIFIED' | 'COUNTRY_RESTRICTED' | 'INVITE_ONLY' | 'PRIVATE';
  restrictedToCountryIds?: string[];
  anonymousSeller: boolean;
}

export async function createListing(user: CurrentUser, input: CreateListingInput) {
  const orgId = user.org!.id;
  const today = new Date();

  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: orgId },
    include: { licenses: true },
  });
  if (org.status !== 'VERIFIED') throw new ApiError('FORBIDDEN', 403, 'ORG_NOT_VERIFIED');
  const hasValidLicense = org.licenses.some(
    (l) => SELLER_TRADE_LICENSES.includes(l.type) && l.status === 'VERIFIED' && l.expiryDate.getTime() > today.getTime(),
  );
  if (!hasValidLicense) throw new ApiError('FORBIDDEN', 403, 'SELLER_LICENSE_NOT_VALID');

  const batch = await prisma.batch.findFirst({
    where: { id: input.batchId, sellerOrgId: orgId, deletedAt: null },
    include: { position: true, product: true },
  });
  if (!batch) throw new ApiError('VALIDATION_ERROR', 400, 'UNKNOWN_BATCH');
  if (batch.recallStatus !== 'NONE') throw new ApiError('CONFLICT', 409, 'BATCH_RECALLED');
  if (batch.quarantineStatus === 'QUARANTINED') throw new ApiError('CONFLICT', 409, 'BATCH_QUARANTINED');
  if (batch.expiryDate.getTime() <= today.getTime()) throw new ApiError('CONFLICT', 409, 'BATCH_EXPIRED');

  const existing = await prisma.listing.findFirst({
    where: { batchId: batch.id, status: { in: [...OPEN_LISTING_STATUSES] }, deletedAt: null },
  });
  if (existing) throw new ApiError('CONFLICT', 409, 'LISTING_EXISTS_FOR_BATCH');

  const available = (batch.position?.onHand ?? batch.quantity) - (batch.position?.reserved ?? 0);
  if (input.quantity > available) throw new ApiError('VALIDATION_ERROR', 400, 'QUANTITY_EXCEEDS_AVAILABLE');
  if (input.minOrderQuantity > input.quantity) throw new ApiError('VALIDATION_ERROR', 400, 'MIN_ORDER_ABOVE_QUANTITY');

  if (input.visibility === 'COUNTRY_RESTRICTED') {
    const ids = input.restrictedToCountryIds ?? [];
    if (ids.length === 0) throw new ApiError('VALIDATION_ERROR', 400, 'RESTRICTED_COUNTRIES_REQUIRED');
    const known = await prisma.country.count({ where: { id: { in: ids } } });
    if (known !== ids.length) throw new ApiError('VALIDATION_ERROR', 400, 'UNKNOWN_COUNTRY');
  }

  const shortDatedMonths = await getConfig('short_dated_threshold_months');
  const listingType = meetsMinimumMonths(batch.expiryDate, today, shortDatedMonths) ? 'SURPLUS' : 'SHORT_DATED';

  const listing = await prisma.listing.create({
    data: {
      sellerOrgId: orgId,
      batchId: batch.id,
      productId: batch.productId,
      listingType,
      quantityAvailable: input.quantity,
      minOrderQuantity: input.minOrderQuantity,
      unitPrice: input.unitPrice,
      currency: input.currency,
      negotiable: input.negotiable,
      incoterm: input.incoterm ?? null,
      visibility: input.visibility,
      restrictedToCountryIds: input.visibility === 'COUNTRY_RESTRICTED' ? (input.restrictedToCountryIds ?? []) : [],
      anonymousSeller: input.anonymousSeller,
      status: 'DRAFT',
      isDemo: org.isDemo,
    },
  });

  // Per-destination verdict snapshots — the core of "eligibility before visibility".
  const verdictCounts = await evaluateListingEligibility(listing.id);

  // Auto-activation only for the fully verified, low-risk case (configuration).
  const autoApprove = await getConfig('listing_auto_approve_verified');
  const lowRisk =
    batch.qualityStatus === 'VERIFIED' &&
    batch.product.status === 'VERIFIED' &&
    !batch.product.coldChain &&
    batch.product.controlledStatus === 'NONE';

  let status: 'ACTIVE' | 'PENDING_COMPLIANCE';
  if (autoApprove && lowRisk) {
    status = 'ACTIVE';
    await prisma.listing.update({
      where: { id: listing.id },
      data: { status, publishedAt: new Date() },
    });
    await writeAudit({
      actorUserId: user.id,
      orgId,
      action: 'LISTING_PUBLISHED_AUTO',
      entityType: 'Listing',
      entityId: listing.id,
      newValue: { listingType, quantity: input.quantity, unitPrice: input.unitPrice, verdictCounts },
    });
    await runMatchingForListing(listing.id);
  } else {
    status = 'PENDING_COMPLIANCE';
    await prisma.listing.update({ where: { id: listing.id }, data: { status } });
    await prisma.complianceReview.create({
      data: { type: 'LISTING', orgId, listingId: listing.id, priority: 50 },
    });
    await writeAudit({
      actorUserId: user.id,
      orgId,
      action: 'LISTING_SUBMITTED_FOR_REVIEW',
      entityType: 'Listing',
      entityId: listing.id,
      newValue: { listingType, quantity: input.quantity, verdictCounts },
    });
  }

  return { listingId: listing.id, status, listingType, verdictCounts };
}

/** Compliance approval path for listings that were not auto-activated. */
export async function activateListing(listingId: string, actorUserId: string): Promise<void> {
  const listing = await prisma.listing.findUniqueOrThrow({ where: { id: listingId } });
  if (listing.status === 'ACTIVE') return;
  await prisma.listing.update({
    where: { id: listingId },
    data: { status: 'ACTIVE', publishedAt: listing.publishedAt ?? new Date() },
  });
  await writeAudit({
    actorType: 'COMPLIANCE',
    actorUserId,
    orgId: listing.sellerOrgId,
    action: 'LISTING_PUBLISHED_REVIEWED',
    entityType: 'Listing',
    entityId: listingId,
  });
  await runMatchingForListing(listingId);
}

/** INVITE_ONLY listings become visible to explicitly invited buyer orgs. */
export async function inviteBuyerToListing(user: CurrentUser, listingId: string, buyerOrgId: string) {
  const listing = await prisma.listing.findFirst({
    where: { id: listingId, sellerOrgId: user.org!.id, deletedAt: null },
  });
  if (!listing) throw new ApiError('NOT_FOUND', 404, 'LISTING_NOT_FOUND');
  if (listing.visibility !== 'INVITE_ONLY') throw new ApiError('CONFLICT', 409, 'LISTING_NOT_INVITE_ONLY');

  const buyerOrg = await prisma.organization.findFirst({
    where: { id: buyerOrgId, deletedAt: null, kind: { in: ['BUYER', 'HYBRID'] }, status: 'VERIFIED' },
  });
  if (!buyerOrg) throw new ApiError('VALIDATION_ERROR', 400, 'BUYER_ORG_NOT_ELIGIBLE');

  const existing = await prisma.listingInvite.findUnique({
    where: { listingId_buyerOrgId: { listingId, buyerOrgId } },
  });
  if (existing) return { inviteId: existing.id, alreadyInvited: true };

  const invite = await prisma.listingInvite.create({
    data: { listingId, buyerOrgId, createdById: user.id },
  });
  await writeAudit({
    actorUserId: user.id,
    orgId: user.org!.id,
    action: 'LISTING_INVITE_CREATED',
    entityType: 'ListingInvite',
    entityId: invite.id,
    newValue: { listingId, buyerOrgId },
  });
  const { notifyOrgOwners } = await import('./notify');
  await notifyOrgOwners(buyerOrgId, {
    type: 'LISTING_INVITE',
    title: 'Einladung zu einem privaten Angebot / Invitation to a private listing',
    data: { listingId },
  });
  return { inviteId: invite.id, alreadyInvited: false };
}

export async function withdrawListing(user: CurrentUser, listingId: string): Promise<void> {
  const listing = await prisma.listing.findFirst({
    where: { id: listingId, sellerOrgId: user.org!.id, deletedAt: null },
  });
  if (!listing) throw new ApiError('NOT_FOUND', 404, 'LISTING_NOT_FOUND');
  if (!['DRAFT', 'PENDING_COMPLIANCE', 'ACTIVE', 'PAUSED'].includes(listing.status)) {
    throw new ApiError('CONFLICT', 409, 'LISTING_NOT_WITHDRAWABLE');
  }
  await prisma.listing.update({ where: { id: listing.id }, data: { status: 'WITHDRAWN' } });
  await writeAudit({
    actorUserId: user.id,
    orgId: user.org!.id,
    action: 'LISTING_WITHDRAWN',
    entityType: 'Listing',
    entityId: listing.id,
    oldValue: { status: listing.status },
  });
}
