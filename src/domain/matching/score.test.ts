import { describe, expect, it } from 'vitest';
import { computeMatchScore } from './score';
import { classifyFastLane, type FastLaneInput } from '../fastlane/fastlane';

const fullMarks = {
  demandStrength: 1,
  priceCompetitiveness: 1 as number | null,
  shelfLifeComfort: 1,
  logisticsFeasibility: 1,
  counterpartyReliability: 1,
};

describe('computeMatchScore', () => {
  it('regulatory gate: blocked candidates are never scored', () => {
    for (const verdict of ['INELIGIBLE', 'HUMAN_REVIEW_REQUIRED', 'INSUFFICIENT_DATA'] as const) {
      const r = computeMatchScore({ verdict, ...fullMarks });
      expect(r.gated).toBe(true);
    }
  });

  it('perfect eligible match scores 100', () => {
    const r = computeMatchScore({ verdict: 'ELIGIBLE', ...fullMarks });
    expect(r.gated).toBe(false);
    if (!r.gated) expect(r.score).toBe(100);
  });

  it('conditional eligibility caps the eligibility component at 0.6', () => {
    const r = computeMatchScore({ verdict: 'CONDITIONALLY_ELIGIBLE', ...fullMarks });
    if (!r.gated) expect(r.score).toBe(84); // 0.6×40 + 60 remaining points
  });

  it('missing price data is neutral (0.5) and flagged, never invented', () => {
    const withNull = computeMatchScore({ verdict: 'ELIGIBLE', ...fullMarks, priceCompetitiveness: null });
    const withHalf = computeMatchScore({ verdict: 'ELIGIBLE', ...fullMarks, priceCompetitiveness: 0.5 });
    if (!withNull.gated && !withHalf.gated) {
      expect(withNull.score).toBe(withHalf.score);
      expect(withNull.priceDataAvailable).toBe(false);
      expect(withHalf.priceDataAvailable).toBe(true);
    }
  });
});

describe('classifyFastLane', () => {
  const allGood: FastLaneInput = {
    productRegistered: true,
    buyerFullyVerified: true,
    importAuthorizationOnFile: true,
    sellerVerified: true,
    documentsComplete: true,
    batchQualityVerified: true,
    airRouteAvailable: true,
    customsProcessKnown: true,
    paymentPreApproved: true,
    temperatureManageable: true,
    estimatedDeliveryDays: 10,
  };

  it('all checks green and <14 days → FASTLANE_ELIGIBLE', () => {
    expect(classifyFastLane(allGood)).toEqual({ status: 'FASTLANE_ELIGIBLE', missing: [] });
  });

  it('recoverable gaps → FASTLANE_CONDITIONAL with the gaps listed', () => {
    const r = classifyFastLane({ ...allGood, documentsComplete: false, paymentPreApproved: false });
    expect(r.status).toBe('FASTLANE_CONDITIONAL');
    expect(r.missing).toEqual(expect.arrayContaining(['documentsComplete', 'paymentPreApproved']));
  });

  it('structural gaps → NOT_FASTLANE', () => {
    expect(classifyFastLane({ ...allGood, airRouteAvailable: false }).status).toBe('NOT_FASTLANE');
    expect(classifyFastLane({ ...allGood, estimatedDeliveryDays: 21 }).status).toBe('NOT_FASTLANE');
    expect(classifyFastLane({ ...allGood, estimatedDeliveryDays: null }).status).toBe('NOT_FASTLANE');
  });
});
