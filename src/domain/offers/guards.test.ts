import { describe, expect, it } from 'vitest';
import { canSubmitOffer, type OfferGuardInput } from './guards';

const base: OfferGuardInput = {
  listingStatus: 'ACTIVE',
  buyerOrgStatus: 'VERIFIED',
  eligibilityVerdict: 'ELIGIBLE',
  quantity: 500,
  minOrderQuantity: 100,
  quantityAvailable: 5000,
};

describe('canSubmitOffer', () => {
  it('allows a verified buyer in an eligible destination', () => {
    expect(canSubmitOffer(base)).toEqual({ ok: true });
    expect(canSubmitOffer({ ...base, eligibilityVerdict: 'CONDITIONALLY_ELIGIBLE' })).toEqual({ ok: true });
  });

  it('blocks every non-purchasable verdict — the prohibited-match rule', () => {
    for (const verdict of ['INELIGIBLE', 'HUMAN_REVIEW_REQUIRED', 'INSUFFICIENT_DATA', null] as const) {
      expect(canSubmitOffer({ ...base, eligibilityVerdict: verdict })).toEqual({
        ok: false,
        code: 'DESTINATION_NOT_ELIGIBLE',
      });
    }
  });

  it('blocks inactive listings and unverified buyers', () => {
    expect(canSubmitOffer({ ...base, listingStatus: 'PAUSED' })).toEqual({ ok: false, code: 'LISTING_NOT_ACTIVE' });
    expect(canSubmitOffer({ ...base, buyerOrgStatus: 'PENDING_KYB' })).toEqual({ ok: false, code: 'BUYER_NOT_VERIFIED' });
  });

  it('enforces quantity constraints', () => {
    expect(canSubmitOffer({ ...base, quantity: 50 })).toEqual({ ok: false, code: 'QUANTITY_BELOW_MIN' });
    expect(canSubmitOffer({ ...base, quantity: 6000 })).toEqual({ ok: false, code: 'QUANTITY_EXCEEDS_AVAILABLE' });
    expect(canSubmitOffer({ ...base, quantity: 1.5 })).toEqual({ ok: false, code: 'QUANTITY_INVALID' });
  });
});
