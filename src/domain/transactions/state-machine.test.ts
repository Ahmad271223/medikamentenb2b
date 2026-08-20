import { describe, expect, it } from 'vitest';
import { availableTransitions, canTransition, type TransitionContext } from './state-machine';

const approvalCtx: TransitionContext = {
  requiredDocsVerified: true,
  permitVerifiedIfRequired: true,
  sanctionsClear: true,
  licensesValid: true,
};

describe('happy path', () => {
  it('allows the full lifecycle in order', () => {
    expect(canTransition('DRAFT', 'LISTED', 'SELLER', { licensesValid: true }).allowed).toBe(true);
    expect(canTransition('LISTED', 'MATCHED', 'SYSTEM').allowed).toBe(true);
    expect(canTransition('OFFER_SUBMITTED', 'OFFER_ACCEPTED', 'SELLER').allowed).toBe(true);
    expect(canTransition('OFFER_ACCEPTED', 'COMPLIANCE_REVIEW', 'SYSTEM').allowed).toBe(true);
    expect(canTransition('COMPLIANCE_REVIEW', 'READY_FOR_PAYMENT', 'COMPLIANCE_OFFICER', approvalCtx).allowed).toBe(true);
    expect(canTransition('READY_FOR_PAYMENT', 'PAYMENT_AUTHORIZED', 'SYSTEM', { paymentAuthorized: true }).allowed).toBe(true);
    expect(canTransition('READY_FOR_PICKUP', 'IN_TRANSIT', 'LOGISTICS', { arrivalShelfLifeStillValid: true }).allowed).toBe(true);
    expect(canTransition('DELIVERED', 'BUYER_ACCEPTED', 'BUYER').allowed).toBe(true);
    expect(canTransition('BUYER_ACCEPTED', 'SETTLED', 'SYSTEM').allowed).toBe(true);
  });
});

describe('illegal transitions', () => {
  it('rejects undefined jumps (e.g. skipping compliance)', () => {
    const r = canTransition('OFFER_ACCEPTED', 'READY_FOR_PAYMENT', 'SYSTEM');
    expect(r).toEqual({ allowed: false, code: 'TRANSITION_NOT_DEFINED' });
  });

  it('terminal states accept nothing', () => {
    expect(canTransition('SETTLED', 'DISPUTE', 'BUYER')).toEqual({ allowed: false, code: 'STATE_TERMINAL' });
    expect(canTransition('CANCELLED', 'LISTED', 'SELLER')).toEqual({ allowed: false, code: 'STATE_TERMINAL' });
  });
});

describe('the human compliance gate', () => {
  it('only the compliance officer can release — not seller, buyer, or platform admin', () => {
    expect(canTransition('COMPLIANCE_REVIEW', 'READY_FOR_PAYMENT', 'SELLER', approvalCtx).allowed).toBe(false);
    expect(canTransition('COMPLIANCE_REVIEW', 'READY_FOR_PAYMENT', 'BUYER', approvalCtx).allowed).toBe(false);
    expect(canTransition('COMPLIANCE_REVIEW', 'READY_FOR_PAYMENT', 'PLATFORM_ADMIN', approvalCtx).allowed).toBe(false);
    expect(canTransition('COMPLIANCE_REVIEW', 'READY_FOR_PAYMENT', 'SYSTEM', approvalCtx).allowed).toBe(false);
  });

  it('release is refused while preconditions are unmet', () => {
    expect(canTransition('COMPLIANCE_REVIEW', 'READY_FOR_PAYMENT', 'COMPLIANCE_OFFICER', { ...approvalCtx, requiredDocsVerified: false })).toEqual({ allowed: false, code: 'DOCS_NOT_VERIFIED' });
    expect(canTransition('COMPLIANCE_REVIEW', 'READY_FOR_PAYMENT', 'COMPLIANCE_OFFICER', { ...approvalCtx, permitVerifiedIfRequired: false })).toEqual({ allowed: false, code: 'PERMIT_NOT_VERIFIED' });
    expect(canTransition('COMPLIANCE_REVIEW', 'READY_FOR_PAYMENT', 'COMPLIANCE_OFFICER', { ...approvalCtx, sanctionsClear: false })).toEqual({ allowed: false, code: 'SANCTIONS_NOT_CLEAR' });
    expect(canTransition('COMPLIANCE_REVIEW', 'READY_FOR_PAYMENT', 'COMPLIANCE_OFFICER', { ...approvalCtx, licensesValid: false })).toEqual({ allowed: false, code: 'LICENSES_NOT_VALID' });
  });
});

describe('safety guards', () => {
  it('a recalled batch freezes all forward movement', () => {
    const r = canTransition('READY_FOR_PICKUP', 'IN_TRANSIT', 'LOGISTICS', { batchRecalled: true, arrivalShelfLifeStillValid: true });
    expect(r).toEqual({ allowed: false, code: 'BATCH_RECALLED' });
    expect(canTransition('READY_FOR_PICKUP', 'RECALL', 'SYSTEM', { batchRecalled: true }).allowed).toBe(true);
  });

  it('shipment is blocked when the shelf-life re-check fails at booking', () => {
    const r = canTransition('READY_FOR_PICKUP', 'IN_TRANSIT', 'SELLER', { arrivalShelfLifeStillValid: false });
    expect(r).toEqual({ allowed: false, code: 'SHELF_LIFE_RECHECK_FAILED' });
  });

  it('cancellation always needs a reason', () => {
    expect(canTransition('NEGOTIATION', 'CANCELLED', 'BUYER', {})).toEqual({ allowed: false, code: 'CANCEL_REASON_REQUIRED' });
    expect(canTransition('NEGOTIATION', 'CANCELLED', 'BUYER', { reason: 'requirements changed' }).allowed).toBe(true);
  });

  it('cancellation is impossible once goods are moving', () => {
    expect(canTransition('IN_TRANSIT', 'CANCELLED', 'BUYER', { reason: 'x' })).toEqual({ allowed: false, code: 'TRANSITION_NOT_DEFINED' });
  });

  it('payment authorization is guard-checked', () => {
    expect(canTransition('READY_FOR_PAYMENT', 'PAYMENT_AUTHORIZED', 'BUYER', {})).toEqual({ allowed: false, code: 'PAYMENT_NOT_AUTHORIZED' });
  });
});

describe('availableTransitions', () => {
  it('lists actor-specific affordances', () => {
    expect(availableTransitions('COMPLIANCE_REVIEW', 'COMPLIANCE_OFFICER')).toEqual(
      expect.arrayContaining(['READY_FOR_PAYMENT', 'REJECTED', 'DOCUMENTS_REQUIRED', 'IMPORT_PERMIT_PENDING']),
    );
    expect(availableTransitions('COMPLIANCE_REVIEW', 'SELLER')).not.toContain('READY_FOR_PAYMENT');
    expect(availableTransitions('SETTLED', 'PLATFORM_ADMIN')).toEqual([]);
  });
});
