import { describe, expect, it } from 'vitest';
import {
  deriveDemandStrength,
  deriveLogisticsFeasibility,
  derivePriceCompetitiveness,
  deriveShelfLifeComfort,
} from './derive';

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

describe('deriveDemandStrength', () => {
  it('full fill = 1, half fill = 0.5, overfill capped at 1', () => {
    expect(deriveDemandStrength(2000, 5000)).toBe(1);
    expect(deriveDemandStrength(2000, 1000)).toBe(0.5);
    expect(deriveDemandStrength(0, 1000)).toBe(0);
  });
});

describe('derivePriceCompetitiveness', () => {
  it('is null (never invented) without a stated maximum', () => {
    expect(derivePriceCompetitiveness(4.2, null)).toBeNull();
  });
  it('scales headroom against the maximum', () => {
    expect(derivePriceCompetitiveness(5, 5)).toBe(0);
    expect(derivePriceCompetitiveness(2.5, 5)).toBe(0.5);
    expect(derivePriceCompetitiveness(7, 5)).toBe(0); // above max clamps to 0
  });
});

describe('deriveShelfLifeComfort', () => {
  it('meeting the requirement exactly ≈ 0.5, double ≈ 1', () => {
    expect(deriveShelfLifeComfort(12 * 30.44, 12)).toBeCloseTo(0.5, 5);
    expect(deriveShelfLifeComfort(24 * 30.44, 12)).toBeCloseTo(1, 5);
  });
  it('defaults the requirement to 6 months when the demand states none', () => {
    expect(deriveShelfLifeComfort(6 * 30.44, null)).toBeCloseTo(0.5, 5);
  });
});

describe('deriveLogisticsFeasibility', () => {
  it('meets deadline = 1, misses = 0.2, unknown = 0.7', () => {
    expect(deriveLogisticsFeasibility(d('2026-09-04'), d('2026-11-30'))).toBe(1);
    expect(deriveLogisticsFeasibility(d('2026-12-04'), d('2026-11-30'))).toBe(0.2);
    expect(deriveLogisticsFeasibility(d('2026-09-04'), null)).toBe(0.7);
  });
});
