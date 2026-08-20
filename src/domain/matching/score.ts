import type { EligibilityVerdict } from '../eligibility/types';

// Match scoring (spec §54). Regulatory eligibility is a GATE, not a factor:
// blocked or review-pending candidates are never scored, no matter how
// commercially attractive.

export interface MatchScoreWeights {
  eligibilityQuality: number;
  demandStrength: number;
  priceCompetitiveness: number;
  shelfLifeComfort: number;
  logisticsFeasibility: number;
  counterpartyReliability: number;
}

export const DEFAULT_MATCH_WEIGHTS: MatchScoreWeights = {
  eligibilityQuality: 0.4,
  demandStrength: 0.2,
  priceCompetitiveness: 0.15,
  shelfLifeComfort: 0.1,
  logisticsFeasibility: 0.1,
  counterpartyReliability: 0.05,
};

export interface MatchScoreInput {
  verdict: EligibilityVerdict;
  /** 0–1 each. priceCompetitiveness null = no sourced reference → neutral 0.5, flagged. */
  demandStrength: number;
  priceCompetitiveness: number | null;
  shelfLifeComfort: number;
  logisticsFeasibility: number;
  counterpartyReliability: number;
}

export type MatchScoreResult =
  | { gated: true; verdict: EligibilityVerdict }
  | {
      gated: false;
      score: number; // 0–100 integer
      breakdown: Record<keyof MatchScoreWeights, number>;
      priceDataAvailable: boolean;
    };

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export function computeMatchScore(
  input: MatchScoreInput,
  weights: MatchScoreWeights = DEFAULT_MATCH_WEIGHTS,
): MatchScoreResult {
  if (input.verdict !== 'ELIGIBLE' && input.verdict !== 'CONDITIONALLY_ELIGIBLE') {
    return { gated: true, verdict: input.verdict };
  }
  const eligibilityQuality = input.verdict === 'ELIGIBLE' ? 1 : 0.6;
  const price = input.priceCompetitiveness === null ? 0.5 : clamp01(input.priceCompetitiveness);

  const breakdown = {
    eligibilityQuality: eligibilityQuality * weights.eligibilityQuality,
    demandStrength: clamp01(input.demandStrength) * weights.demandStrength,
    priceCompetitiveness: price * weights.priceCompetitiveness,
    shelfLifeComfort: clamp01(input.shelfLifeComfort) * weights.shelfLifeComfort,
    logisticsFeasibility: clamp01(input.logisticsFeasibility) * weights.logisticsFeasibility,
    counterpartyReliability: clamp01(input.counterpartyReliability) * weights.counterpartyReliability,
  };
  const total = Object.values(breakdown).reduce((a, b) => a + b, 0);
  const weightSum = Object.values(weights).reduce((a, b) => a + b, 0);

  return {
    gated: false,
    score: Math.round((total / weightSum) * 100),
    breakdown,
    priceDataAvailable: input.priceCompetitiveness !== null,
  };
}
