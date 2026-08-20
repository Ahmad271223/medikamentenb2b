import { describe, expect, it } from 'vitest';
import { evaluateBatchForDestination } from './engine';
import type { BuyerSnapshot, EligibilityInput } from './types';

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const TODAY = d('2026-08-20');

function buyer(overrides: Partial<BuyerSnapshot> = {}): BuyerSnapshot {
  return {
    id: 'buyer-1',
    status: 'VERIFIED',
    sanctionsResult: 'CLEAR',
    sanctionsCheckedAt: d('2026-08-01'),
    licenses: [{ type: 'IMPORT', status: 'VERIFIED', expiryDate: d('2028-01-01') }],
    importPermits: [{ countryId: 'ZZ', productId: null, status: 'VERIFIED', expiryDate: d('2027-12-31') }],
    warehouseCapabilities: { ambient: true, cold2to8: false, frozen: false, controlledRoom: false },
    ...overrides,
  };
}

/** Fully verified synthetic baseline — asserts nothing about any real country. */
function baseInput(overrides: Partial<EligibilityInput> = {}): EligibilityInput {
  return {
    today: TODAY,
    batch: {
      id: 'batch-1',
      expiryDate: d('2028-06-30'),
      manufacturingDate: d('2025-06-30'),
      quantity: 5000,
      recallStatus: 'NONE',
      quarantineStatus: 'NONE',
      qualityStatus: 'VERIFIED',
    },
    product: {
      id: 'prod-1',
      status: 'VERIFIED',
      atcCode: 'J01CA04',
      dosageForm: 'tablet',
      controlledStatus: 'NONE',
      coldChain: false,
      temperatureMode: 'AMBIENT',
      serializationRequired: false,
    },
    seller: {
      id: 'seller-1',
      status: 'VERIFIED',
      sanctionsResult: 'CLEAR',
      sanctionsCheckedAt: d('2026-08-01'),
      licenses: [{ type: 'WDA', status: 'VERIFIED', expiryDate: d('2028-01-01') }],
    },
    buyer: buyer(),
    destination: {
      countryId: 'ZZ',
      tradeStatus: 'TRADE_ENABLED',
      productRegistration: 'REGISTERED',
      shelfLifeRule: { id: 'rule-v1', status: 'VERIFIED', payload: { kind: 'ABSOLUTE_MONTHS', minMonths: 12 } },
      importPermitRequired: true,
      requiredDocumentCodes: [],
      shippingDays: 6,
      customsBufferDays: 4,
      operationalBufferDays: 5,
    },
    availableDocumentCodes: [],
    config: {
      excludedControlledStatuses: ['NARCOTIC', 'PSYCHOTROPIC', 'OTHER_CONTROLLED'],
      allowColdChain: false,
      sanctionsMaxAgeDays: 180,
      engineVersion: 'test',
    },
    ...overrides,
  };
}

describe('happy path', () => {
  it('fully verified case → ELIGIBLE with projections', () => {
    const r = evaluateBatchForDestination(baseInput());
    expect(r.verdict).toBe('ELIGIBLE');
    expect(r.blockingIssues).toEqual([]);
    expect(r.projectedArrivalDate.toISOString().slice(0, 10)).toBe('2026-09-04');
    expect(r.arrivalShelfLifeDays).toBeGreaterThan(600);
    expect(r.arrivalShelfLifePercent).not.toBeNull();
    expect(r.ruleVersionIds).toContain('rule-v1');
  });
});

describe('hard blocks → INELIGIBLE', () => {
  it('recalled batch', () => {
    const input = baseInput();
    input.batch.recallStatus = 'RECALLED';
    const r = evaluateBatchForDestination(input);
    expect(r.verdict).toBe('INELIGIBLE');
    expect(r.blockingIssues).toContain('BATCH_RECALLED');
  });

  it('quarantined batch', () => {
    const input = baseInput();
    input.batch.quarantineStatus = 'QUARANTINED';
    expect(evaluateBatchForDestination(input).blockingIssues).toContain('BATCH_QUARANTINED');
  });

  it('expired seller license', () => {
    const input = baseInput();
    input.seller.licenses = [{ type: 'WDA', status: 'VERIFIED', expiryDate: d('2026-01-01') }];
    const r = evaluateBatchForDestination(input);
    expect(r.verdict).toBe('INELIGIBLE');
    expect(r.blockingIssues).toContain('SELLER_LICENSE_EXPIRED');
  });

  it('unverified seller license', () => {
    const input = baseInput();
    input.seller.licenses = [{ type: 'WDA', status: 'PENDING_REVIEW', expiryDate: d('2028-01-01') }];
    expect(evaluateBatchForDestination(input).blockingIssues).toContain('SELLER_LICENSE_NOT_VERIFIED');
  });

  it('sanctions BLOCKED', () => {
    const input = baseInput();
    input.seller.sanctionsResult = 'BLOCKED';
    expect(evaluateBatchForDestination(input).blockingIssues).toContain('SANCTIONS_BLOCKED');
  });

  it('excluded product class (controlled substance, config-driven)', () => {
    const input = baseInput();
    input.product.controlledStatus = 'NARCOTIC';
    expect(evaluateBatchForDestination(input).blockingIssues).toContain('PRODUCT_CLASS_EXCLUDED');
  });

  it('insufficient shelf life at projected arrival, with explanation', () => {
    const input = baseInput();
    input.batch.expiryDate = d('2027-01-31'); // ~5 months at arrival vs required 12
    input.batch.manufacturingDate = d('2024-01-31');
    const r = evaluateBatchForDestination(input);
    expect(r.verdict).toBe('INELIGIBLE');
    expect(r.blockingIssues).toContain('SHELF_LIFE_BELOW_MIN_MONTHS');
    const reason = r.reasons.find((x) => x.code === 'SHELF_LIFE_BELOW_MIN_MONTHS');
    expect(reason?.params?.minMonths).toBe(12);
  });

  it('product not registered in destination', () => {
    const input = baseInput();
    input.destination.productRegistration = 'NOT_REGISTERED';
    expect(evaluateBatchForDestination(input).blockingIssues).toContain('PRODUCT_NOT_REGISTERED');
  });

  it('consumption infeasibility (spec §57)', () => {
    const input = baseInput({ buyer: buyer({ monthlyConsumptionUnits: 100, requestedQuantity: 5000 }) });
    input.batch.expiryDate = d('2027-02-28'); // ~6 months at arrival, needs ~50 months to consume
    input.batch.manufacturingDate = d('2025-02-28');
    input.destination.shelfLifeRule = { id: 'rule-v1', status: 'VERIFIED', payload: { kind: 'ABSOLUTE_MONTHS', minMonths: 3 } };
    const r = evaluateBatchForDestination(input);
    expect(r.blockingIssues).toContain('CONSUMPTION_INFEASIBLE');
  });

  it('buyer storage incapable of cold chain', () => {
    const input = baseInput();
    input.product.coldChain = true;
    input.product.temperatureMode = 'COLD_2_8';
    const r = evaluateBatchForDestination(input);
    expect(r.blockingIssues).toContain('BUYER_STORAGE_INCAPABLE');
  });

  it('hard blocks dominate missing data', () => {
    const input = baseInput();
    input.batch.recallStatus = 'RECALLED';
    input.destination.productRegistration = 'UNKNOWN';
    expect(evaluateBatchForDestination(input).verdict).toBe('INELIGIBLE');
  });
});

describe('uncertainty degradation', () => {
  it('unverified (DEMO) shelf-life rule → HUMAN_REVIEW_REQUIRED, never ELIGIBLE', () => {
    const input = baseInput();
    input.destination.shelfLifeRule = { id: 'rule-demo', status: 'DEMO', payload: { kind: 'ABSOLUTE_MONTHS', minMonths: 12 } };
    const r = evaluateBatchForDestination(input);
    expect(r.verdict).toBe('HUMAN_REVIEW_REQUIRED');
    expect(r.requiresHumanReview).toBe(true);
  });

  it('country not trade-enabled → HUMAN_REVIEW_REQUIRED', () => {
    const input = baseInput();
    input.destination.tradeStatus = 'NOT_TRADE_ENABLED';
    expect(evaluateBatchForDestination(input).verdict).toBe('HUMAN_REVIEW_REQUIRED');
  });

  it('missing shelf-life rule → HUMAN_REVIEW_REQUIRED', () => {
    const input = baseInput();
    input.destination.shelfLifeRule = null;
    expect(evaluateBatchForDestination(input).verdict).toBe('HUMAN_REVIEW_REQUIRED');
  });

  it('unknown product registration → INSUFFICIENT_DATA', () => {
    const input = baseInput();
    input.destination.productRegistration = 'UNKNOWN';
    expect(evaluateBatchForDestination(input).verdict).toBe('INSUFFICIENT_DATA');
  });

  it('percentage rule without original shelf life → INSUFFICIENT_DATA', () => {
    const input = baseInput();
    input.batch.manufacturingDate = null;
    input.batch.originalShelfLifeMonths = null;
    input.destination.shelfLifeRule = { id: 'rule-v2', status: 'VERIFIED', payload: { kind: 'PERCENTAGE_OF_ORIGINAL', minPercent: 60 } };
    const r = evaluateBatchForDestination(input);
    expect(r.verdict).toBe('INSUFFICIENT_DATA');
    expect(r.arrivalShelfLifePercent).toBeNull();
  });

  it('unknown import-permit requirement → INSUFFICIENT_DATA', () => {
    const input = baseInput();
    input.destination.importPermitRequired = null;
    expect(evaluateBatchForDestination(input).verdict).toBe('INSUFFICIENT_DATA');
  });

  it('sanctions not screened → HUMAN_REVIEW_REQUIRED', () => {
    const input = baseInput();
    input.seller.sanctionsResult = 'NOT_SCREENED';
    expect(evaluateBatchForDestination(input).verdict).toBe('HUMAN_REVIEW_REQUIRED');
  });

  it('stale sanctions check → HUMAN_REVIEW_REQUIRED', () => {
    const input = baseInput();
    input.seller.sanctionsCheckedAt = d('2025-01-01');
    expect(evaluateBatchForDestination(input).verdict).toBe('HUMAN_REVIEW_REQUIRED');
  });

  it('cold chain in MVP requires review even when buyer is capable', () => {
    const input = baseInput({
      buyer: buyer({ warehouseCapabilities: { ambient: true, cold2to8: true, frozen: false, controlledRoom: false } }),
    });
    input.product.coldChain = true;
    input.product.temperatureMode = 'COLD_2_8';
    expect(evaluateBatchForDestination(input).verdict).toBe('HUMAN_REVIEW_REQUIRED');
  });
});

describe('conditions → CONDITIONALLY_ELIGIBLE', () => {
  it('missing import permit is a condition, not a block', () => {
    const input = baseInput({ buyer: buyer({ importPermits: [] }) });
    const r = evaluateBatchForDestination(input);
    expect(r.verdict).toBe('CONDITIONALLY_ELIGIBLE');
    expect(r.conditions).toContain('IMPORT_PERMIT_MISSING');
    expect(r.requiredPermits).toContain('IMPORT_PERMIT');
  });

  it('missing required documents are listed by code', () => {
    const input = baseInput();
    input.destination.requiredDocumentCodes = ['CERTIFICATE_OF_ANALYSIS', 'CERTIFICATE_OF_ORIGIN'];
    input.availableDocumentCodes = ['CERTIFICATE_OF_ANALYSIS'];
    const r = evaluateBatchForDestination(input);
    expect(r.verdict).toBe('CONDITIONALLY_ELIGIBLE');
    expect(r.requiredDocuments).toContain('CERTIFICATE_OF_ORIGIN');
    const missing = r.reasons.filter((x) => x.code === 'DOCUMENT_MISSING');
    expect(missing).toHaveLength(1);
    expect(missing[0]?.params?.documentCode).toBe('CERTIFICATE_OF_ORIGIN');
  });

  it('registration exemption path is conditional', () => {
    const input = baseInput();
    input.destination.productRegistration = 'EXEMPT_POSSIBLE';
    expect(evaluateBatchForDestination(input).verdict).toBe('CONDITIONALLY_ELIGIBLE');
  });
});

describe('country-level evaluation (no concrete buyer)', () => {
  it('permit requirement surfaces as condition when no buyer is in scope', () => {
    const r = evaluateBatchForDestination(baseInput({ buyer: null }));
    expect(r.verdict).toBe('CONDITIONALLY_ELIGIBLE');
    expect(r.conditions).toContain('IMPORT_PERMIT_REQUIRED');
  });
});
