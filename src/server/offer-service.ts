import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { ApiError } from '@/lib/errors';
import { writeAudit } from '@/lib/audit/audit';
import { getConfig } from '@/lib/config/platform-config';
import { canSubmitOffer } from '@/domain/offers/guards';
import { computeDealEconomics } from '@/domain/economics/economics';
import { canTransition } from '@/domain/transactions/state-machine';
import type { EligibilityVerdict } from '@/domain/eligibility/types';
import { notifyOrgOwners } from './notify';
import { emitWebhookEvent } from './webhook-service';
import type { CurrentUser } from '@/lib/auth/current';

export interface SubmitOfferInput {
  listingId: string;
  quantity: number;
  unitPrice: string;
  incoterm?: string;
  requestedDeliveryDate?: string;
  conditions?: string;
}

async function loadOfferContext(listingId: string, buyerOrgId: string) {
  const [listing, buyerOrg] = await Promise.all([
    prisma.listing.findFirst({
      where: { id: listingId, deletedAt: null },
      include: { batch: { include: { position: true } }, sellerOrg: true, product: true },
    }),
    prisma.organization.findUniqueOrThrow({ where: { id: buyerOrgId } }),
  ]);
  if (!listing) throw new ApiError('NOT_FOUND', 404, 'LISTING_NOT_FOUND');
  const eligibility = await prisma.listingEligibility.findUnique({
    where: { listingId_countryId: { listingId: listing.id, countryId: buyerOrg.countryId } },
  });
  return { listing, buyerOrg, eligibility };
}

export async function submitOffer(user: CurrentUser, input: SubmitOfferInput) {
  const buyerOrgId = user.org!.id;
  const { listing, buyerOrg, eligibility } = await loadOfferContext(input.listingId, buyerOrgId);

  if (listing.sellerOrgId === buyerOrgId) throw new ApiError('CONFLICT', 409, 'CANNOT_BUY_OWN_LISTING');
  if (listing.batch.recallStatus !== 'NONE' || listing.batch.quarantineStatus === 'QUARANTINED') {
    throw new ApiError('CONFLICT', 409, 'BATCH_BLOCKED');
  }
  let visibleToBuyer =
    listing.visibility === 'PUBLIC_VERIFIED' ||
    (listing.visibility === 'COUNTRY_RESTRICTED' && listing.restrictedToCountryIds.includes(buyerOrg.countryId));
  if (!visibleToBuyer && listing.visibility === 'INVITE_ONLY') {
    const invite = await prisma.listingInvite.findUnique({
      where: { listingId_buyerOrgId: { listingId: listing.id, buyerOrgId } },
    });
    visibleToBuyer = invite !== null;
  }
  if (!visibleToBuyer) throw new ApiError('FORBIDDEN', 403, 'VISIBILITY_RESTRICTED');

  // The prohibited-match rule, enforced server-side (spec §68/§71).
  const guard = canSubmitOffer({
    listingStatus: listing.status,
    buyerOrgStatus: buyerOrg.status,
    eligibilityVerdict: (eligibility?.verdict as EligibilityVerdict | undefined) ?? null,
    quantity: input.quantity,
    minOrderQuantity: listing.minOrderQuantity,
    quantityAvailable: listing.quantityAvailable,
  });
  if (!guard.ok) throw new ApiError('FORBIDDEN', 403, guard.code);

  let negotiation = await prisma.negotiation.findFirst({
    where: { listingId: listing.id, buyerOrgId, status: 'OPEN' },
  });
  if (negotiation) {
    const pending = await prisma.offer.findFirst({
      where: { negotiationId: negotiation.id, status: 'SUBMITTED' },
    });
    if (pending) throw new ApiError('CONFLICT', 409, 'OFFER_PENDING');
  } else {
    negotiation = await prisma.negotiation.create({
      data: { listingId: listing.id, sellerOrgId: listing.sellerOrgId, buyerOrgId },
    });
  }

  const offer = await prisma.offer.create({
    data: {
      negotiationId: negotiation.id,
      byOrgId: buyerOrgId,
      direction: 'BUYER_TO_SELLER',
      quantity: input.quantity,
      unitPrice: input.unitPrice,
      currency: listing.currency,
      incoterm: input.incoterm ?? listing.incoterm,
      requestedDeliveryDate: input.requestedDeliveryDate ? new Date(input.requestedDeliveryDate) : null,
      conditions: input.conditions ?? null,
    },
  });
  await writeAudit({
    actorUserId: user.id,
    orgId: buyerOrgId,
    action: 'OFFER_SUBMITTED',
    entityType: 'Offer',
    entityId: offer.id,
    newValue: { listingId: listing.id, quantity: input.quantity, unitPrice: input.unitPrice },
  });
  await notifyOrgOwners(listing.sellerOrgId, {
    type: 'OFFER_RECEIVED',
    title: 'Neues Angebot erhalten / New offer received',
    body: `${input.quantity} × ${input.unitPrice} ${listing.currency}`,
    data: { negotiationId: negotiation.id, offerId: offer.id },
  });
  void emitWebhookEvent([listing.sellerOrgId], 'offer.received', {
    offerId: offer.id,
    listingId: listing.id,
    quantity: input.quantity,
    unitPrice: input.unitPrice,
    currency: listing.currency,
  }).catch(() => undefined);

  return { negotiationId: negotiation.id, offerId: offer.id };
}

export interface RespondInput {
  action: 'ACCEPT' | 'REJECT' | 'COUNTER';
  reason?: string;
  counter?: { quantity: number; unitPrice: string; conditions?: string };
}

export async function respondToOffer(user: CurrentUser, offerId: string, input: RespondInput) {
  const offer = await prisma.offer.findUnique({
    where: { id: offerId },
    include: { negotiation: { include: { listing: { include: { batch: { include: { position: true } }, sellerOrg: true } } } } },
  });
  if (!offer || !offer.negotiation.listing) throw new ApiError('NOT_FOUND', 404, 'OFFER_NOT_FOUND');
  if (offer.status !== 'SUBMITTED') throw new ApiError('CONFLICT', 409, 'OFFER_NOT_OPEN');

  const negotiation = offer.negotiation;
  const listing = negotiation.listing!;
  const responderOrgId =
    offer.direction === 'BUYER_TO_SELLER' ? negotiation.sellerOrgId : negotiation.buyerOrgId;
  if (user.org?.id !== responderOrgId) throw new ApiError('FORBIDDEN', 403, 'NOT_COUNTERPARTY');

  if (input.action === 'REJECT') {
    await prisma.offer.update({ where: { id: offer.id }, data: { status: 'REJECTED' } });
    await writeAudit({
      actorUserId: user.id, orgId: responderOrgId, action: 'OFFER_REJECTED',
      entityType: 'Offer', entityId: offer.id, reason: input.reason ?? null,
    });
    await notifyOrgOwners(offer.byOrgId, {
      type: 'OFFER_REJECTED', title: 'Angebot abgelehnt / Offer rejected', body: input.reason,
      data: { negotiationId: negotiation.id },
    });
    return { status: 'REJECTED' as const };
  }

  if (input.action === 'COUNTER') {
    if (!input.counter) throw new ApiError('VALIDATION_ERROR', 400, 'COUNTER_REQUIRED');
    const counter = await prisma.$transaction(async (tx) => {
      await tx.offer.update({ where: { id: offer.id }, data: { status: 'COUNTERED' } });
      return tx.offer.create({
        data: {
          negotiationId: negotiation.id,
          byOrgId: responderOrgId,
          direction: offer.direction === 'BUYER_TO_SELLER' ? 'SELLER_TO_BUYER' : 'BUYER_TO_SELLER',
          quantity: input.counter!.quantity,
          unitPrice: input.counter!.unitPrice,
          currency: offer.currency,
          incoterm: offer.incoterm,
          requestedDeliveryDate: offer.requestedDeliveryDate,
          conditions: input.counter!.conditions ?? null,
          parentOfferId: offer.id,
        },
      });
    });
    await writeAudit({
      actorUserId: user.id, orgId: responderOrgId, action: 'OFFER_COUNTERED',
      entityType: 'Offer', entityId: counter.id,
      newValue: { quantity: counter.quantity, unitPrice: input.counter.unitPrice },
    });
    await notifyOrgOwners(offer.byOrgId, {
      type: 'OFFER_COUNTERED', title: 'Gegenangebot erhalten / Counter-offer received',
      body: `${counter.quantity} × ${input.counter.unitPrice} ${offer.currency}`,
      data: { negotiationId: negotiation.id, offerId: counter.id },
    });
    return { status: 'COUNTERED' as const, counterOfferId: counter.id };
  }

  // ACCEPT — re-check everything at the moment of commitment, then create the
  // transaction and route it into the mandatory human compliance review.
  const buyerOrg = await prisma.organization.findUniqueOrThrow({ where: { id: negotiation.buyerOrgId } });
  const eligibility = await prisma.listingEligibility.findUnique({
    where: { listingId_countryId: { listingId: listing.id, countryId: buyerOrg.countryId } },
  });
  const guard = canSubmitOffer({
    listingStatus: listing.status,
    buyerOrgStatus: buyerOrg.status,
    eligibilityVerdict: (eligibility?.verdict as EligibilityVerdict | undefined) ?? null,
    quantity: offer.quantity,
    minOrderQuantity: listing.minOrderQuantity,
    quantityAvailable: listing.quantityAvailable,
  });
  if (!guard.ok) throw new ApiError('CONFLICT', 409, guard.code);
  if (listing.batch.recallStatus !== 'NONE' || listing.batch.quarantineStatus === 'QUARANTINED') {
    throw new ApiError('CONFLICT', 409, 'BATCH_BLOCKED');
  }

  const [commissionPercent, buyerFeePercent] = await Promise.all([
    getConfig('seller_commission_percent'),
    getConfig('buyer_fee_percent'),
  ]);
  const economics = computeDealEconomics({
    unitPrice: offer.unitPrice.toString(),
    quantity: offer.quantity,
    sellerCommissionPercent: commissionPercent,
    buyerFeePercent,
  });

  const transaction = await prisma.$transaction(async (tx) => {
    await tx.offer.update({ where: { id: offer.id }, data: { status: 'ACCEPTED' } });
    await tx.offer.updateMany({
      where: { negotiationId: negotiation.id, status: 'SUBMITTED', id: { not: offer.id } },
      data: { status: 'EXPIRED' },
    });
    await tx.negotiation.update({ where: { id: negotiation.id }, data: { status: 'CONCLUDED' } });

    // Reserve inventory.
    const position = listing.batch.position;
    if (!position || position.onHand - position.reserved < offer.quantity) {
      throw new ApiError('CONFLICT', 409, 'QUANTITY_EXCEEDS_AVAILABLE');
    }
    await tx.inventoryPosition.update({
      where: { id: position.id },
      data: { reserved: { increment: offer.quantity } },
    });
    const remaining = listing.quantityAvailable - offer.quantity;
    await tx.listing.update({
      where: { id: listing.id },
      data: { quantityAvailable: remaining, status: remaining === 0 ? 'SOLD_OUT' : listing.status },
    });

    const transaction = await tx.transaction.create({
      data: {
        negotiationId: negotiation.id,
        listingId: listing.id,
        batchId: listing.batchId,
        sellerOrgId: negotiation.sellerOrgId,
        buyerOrgId: negotiation.buyerOrgId,
        destinationCountryId: buyerOrg.countryId,
        state: 'OFFER_ACCEPTED',
        quantity: offer.quantity,
        unitPrice: offer.unitPrice,
        currency: offer.currency,
        subtotal: economics.subtotal.toString(),
        commissionRate: String(commissionPercent),
        commissionAmount: economics.commissionAmount.toString(),
        paymentFees: null,
        buyerLandedCost: economics.buyerLandedCost.toString(),
        sellerPayout: economics.sellerPayout.toString(),
        platformRevenue: economics.platformRevenue.toString(),
        eligibilitySnapshot: eligibility
          ? ({
              verdict: eligibility.verdict,
              reasons: eligibility.reasons,
              requiredPermits: eligibility.requiredPermits,
              requiredDocuments: eligibility.requiredDocuments,
              evaluatedAt: eligibility.evaluatedAt,
            } as Prisma.InputJsonValue)
          : undefined,
        isDemo: listing.isDemo,
        items: { create: { batchId: listing.batchId, quantity: offer.quantity, unitPrice: offer.unitPrice } },
      },
    });

    await tx.transactionStateEvent.create({
      data: { transactionId: transaction.id, fromState: null, toState: 'OFFER_ACCEPTED', actorType: 'USER', actorUserId: user.id },
    });

    // Mandatory next step — never skippable (state machine enforces it too).
    const step = canTransition('OFFER_ACCEPTED', 'COMPLIANCE_REVIEW', 'SYSTEM');
    if (!step.allowed) throw new ApiError('INTERNAL', 500, 'STATE_MACHINE_VIOLATION');
    await tx.transaction.update({ where: { id: transaction.id }, data: { state: 'COMPLIANCE_REVIEW' } });
    await tx.transactionStateEvent.create({
      data: { transactionId: transaction.id, fromState: 'OFFER_ACCEPTED', toState: 'COMPLIANCE_REVIEW', actorType: 'SYSTEM' },
    });
    // Queue priority scales with transaction value (spec §65) — capped at 95.
    const priority = Math.min(95, 60 + Math.floor(Number(economics.subtotal) / 5000) * 5);
    await tx.complianceReview.create({
      data: { type: 'TRANSACTION', orgId: negotiation.sellerOrgId, transactionId: transaction.id, priority },
    });

    await writeAudit(
      {
        actorUserId: user.id,
        orgId: responderOrgId,
        action: 'OFFER_ACCEPTED',
        entityType: 'Offer',
        entityId: offer.id,
        newValue: { transactionId: transaction.id },
      },
      tx,
    );
    await writeAudit(
      {
        actorType: 'SYSTEM',
        orgId: negotiation.sellerOrgId,
        action: 'TRANSACTION_CREATED',
        entityType: 'Transaction',
        entityId: transaction.id,
        newValue: {
          quantity: offer.quantity,
          unitPrice: offer.unitPrice.toString(),
          subtotal: economics.subtotal.toString(),
          state: 'COMPLIANCE_REVIEW',
        },
      },
      tx,
    );
    return transaction;
  });

  await Promise.all([
    notifyOrgOwners(negotiation.buyerOrgId, {
      type: 'OFFER_ACCEPTED',
      title: 'Angebot angenommen / Offer accepted',
      body: 'Transaktion in Compliance-Prüfung / Transaction under compliance review',
      data: { transactionId: transaction.id },
    }),
    notifyOrgOwners(negotiation.sellerOrgId, {
      type: 'TRANSACTION_CREATED',
      title: 'Transaktion erstellt / Transaction created',
      body: 'Compliance-Prüfung läuft / Compliance review pending',
      data: { transactionId: transaction.id },
    }),
  ]);

  void emitWebhookEvent([negotiation.sellerOrgId, negotiation.buyerOrgId], 'offer.accepted', {
    offerId: offer.id,
    transactionId: transaction.id,
    state: 'COMPLIANCE_REVIEW',
  }).catch(() => undefined);

  return { status: 'ACCEPTED' as const, transactionId: transaction.id };
}
