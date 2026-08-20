import type { EligibilityVerdict } from '../eligibility/types';

// Pure guard for offer submission — enforced server-side in the API (the UI
// merely mirrors it). A buyer in a non-eligible destination can never submit,
// no matter what the client sends.

export interface OfferGuardInput {
  listingStatus: string;
  buyerOrgStatus: string;
  /** Verdict of the listing for the buyer's destination country (null = not evaluated). */
  eligibilityVerdict: EligibilityVerdict | null;
  quantity: number;
  minOrderQuantity: number;
  quantityAvailable: number;
}

export type OfferGuardResult = { ok: true } | { ok: false; code: string };

const PURCHASABLE: ReadonlySet<EligibilityVerdict> = new Set(['ELIGIBLE', 'CONDITIONALLY_ELIGIBLE']);

export function canSubmitOffer(input: OfferGuardInput): OfferGuardResult {
  if (input.listingStatus !== 'ACTIVE') return { ok: false, code: 'LISTING_NOT_ACTIVE' };
  if (input.buyerOrgStatus !== 'VERIFIED') return { ok: false, code: 'BUYER_NOT_VERIFIED' };
  if (!input.eligibilityVerdict || !PURCHASABLE.has(input.eligibilityVerdict)) {
    return { ok: false, code: 'DESTINATION_NOT_ELIGIBLE' };
  }
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) return { ok: false, code: 'QUANTITY_INVALID' };
  if (input.quantity < input.minOrderQuantity) return { ok: false, code: 'QUANTITY_BELOW_MIN' };
  if (input.quantity > input.quantityAvailable) return { ok: false, code: 'QUANTITY_EXCEEDS_AVAILABLE' };
  return { ok: true };
}
