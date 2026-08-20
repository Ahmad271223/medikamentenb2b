import { describe, expect, it } from 'vitest';
import { calculateShelfLife } from './shelf-life';
import { evaluateShelfLifeRule } from './rules';
import type { ShelfLifeRulePayload } from './types';

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

// Batch with 18 months remaining at arrival, 50% of original.
const lifeKnownOriginal = calculateShelfLife({
  expiryDate: d('2028-03-01'),
  manufacturingDate: d('2025-03-01'),
  atDate: d('2026-08-31'),
});
// Same expiry but original shelf life unknown.
const lifeUnknownOriginal = calculateShelfLife({ expiryDate: d('2028-03-01'), atDate: d('2026-08-31') });
// Short-dated: ~5 months remaining.
const lifeShort = calculateShelfLife({
  expiryDate: d('2027-01-15'),
  manufacturingDate: d('2024-01-15'),
  atDate: d('2026-08-31'),
});

describe('ABSOLUTE_MONTHS', () => {
  it('passes when enough months remain', () => {
    expect(evaluateShelfLifeRule({ kind: 'ABSOLUTE_MONTHS', minMonths: 12 }, lifeKnownOriginal).outcome).toBe('PASS');
  });
  it('fails with explanation when below', () => {
    const r = evaluateShelfLifeRule({ kind: 'ABSOLUTE_MONTHS', minMonths: 6 }, lifeShort);
    expect(r.outcome).toBe('FAIL');
    expect(r.code).toBe('SHELF_LIFE_BELOW_MIN_MONTHS');
  });
});

describe('PERCENTAGE_OF_ORIGINAL', () => {
  it('passes above threshold', () => {
    expect(evaluateShelfLifeRule({ kind: 'PERCENTAGE_OF_ORIGINAL', minPercent: 40 }, lifeKnownOriginal).outcome).toBe('PASS');
  });
  it('fails below threshold', () => {
    expect(evaluateShelfLifeRule({ kind: 'PERCENTAGE_OF_ORIGINAL', minPercent: 60 }, lifeKnownOriginal).outcome).toBe('FAIL');
  });
  it('spec §53 example: 20.8% remaining vs 60% required → FAIL', () => {
    const life = calculateShelfLife({
      expiryDate: d('2027-04-30'),
      originalShelfLifeMonths: 36,
      atDate: d('2026-09-15'),
    });
    const r = evaluateShelfLifeRule({ kind: 'PERCENTAGE_OF_ORIGINAL', minPercent: 60 }, life);
    expect(r.outcome).toBe('FAIL');
    expect(life.percentRemaining).toBeLessThan(22);
  });
  it('never guesses: unknown original → INSUFFICIENT_DATA', () => {
    const r = evaluateShelfLifeRule({ kind: 'PERCENTAGE_OF_ORIGINAL', minPercent: 60 }, lifeUnknownOriginal);
    expect(r.outcome).toBe('INSUFFICIENT_DATA');
    expect(r.code).toBe('ORIGINAL_SHELF_LIFE_UNKNOWN');
  });
});

describe('COMBINED_RULE', () => {
  const combined = (combinator: 'AND' | 'OR' | 'WHICHEVER_GREATER'): ShelfLifeRulePayload => ({
    kind: 'COMBINED_RULE',
    minMonths: 12,
    minPercent: 60,
    combinator,
  });
  it('AND fails when one side fails', () => {
    expect(evaluateShelfLifeRule(combined('AND'), lifeKnownOriginal).outcome).toBe('FAIL'); // 18mo ok, 50% < 60%
  });
  it('WHICHEVER_GREATER behaves like the stricter requirement', () => {
    expect(evaluateShelfLifeRule(combined('WHICHEVER_GREATER'), lifeKnownOriginal).outcome).toBe('FAIL');
  });
  it('OR passes when one side passes', () => {
    expect(evaluateShelfLifeRule(combined('OR'), lifeKnownOriginal).outcome).toBe('PASS');
  });
  it('OR with failing months and unknown percent → INSUFFICIENT_DATA, not FAIL', () => {
    const life = calculateShelfLife({ expiryDate: d('2027-01-15'), atDate: d('2026-08-31') }); // ~4.5mo, original unknown
    expect(evaluateShelfLifeRule(combined('OR'), life).outcome).toBe('INSUFFICIENT_DATA');
  });
  it('AND with passing months but unknown percent → INSUFFICIENT_DATA', () => {
    const r = evaluateShelfLifeRule(combined('AND'), lifeUnknownOriginal); // 18mo pass, % unknown
    expect(r.outcome).toBe('INSUFFICIENT_DATA');
  });
});

describe('PRODUCT_SPECIFIC', () => {
  const rule: ShelfLifeRulePayload = {
    kind: 'PRODUCT_SPECIFIC',
    rules: [{ match: { coldChain: true }, rule: { kind: 'ABSOLUTE_MONTHS', minMonths: 24 } }],
    fallback: { kind: 'ABSOLUTE_MONTHS', minMonths: 6 },
  };
  it('applies the specific rule to matching products', () => {
    expect(evaluateShelfLifeRule(rule, lifeKnownOriginal, { coldChain: true }).outcome).toBe('FAIL'); // 18 < 24
  });
  it('applies the fallback otherwise', () => {
    expect(evaluateShelfLifeRule(rule, lifeKnownOriginal, { coldChain: false }).outcome).toBe('PASS');
  });
});

describe('special kinds', () => {
  it('CASE_BY_CASE → HUMAN_REVIEW', () => {
    expect(evaluateShelfLifeRule({ kind: 'CASE_BY_CASE' }, lifeKnownOriginal).outcome).toBe('HUMAN_REVIEW');
  });
  it('NO_VERIFIED_RULE → HUMAN_REVIEW', () => {
    expect(evaluateShelfLifeRule({ kind: 'NO_VERIFIED_RULE' }, lifeKnownOriginal).outcome).toBe('HUMAN_REVIEW');
  });
  it('EXEMPTION_AVAILABLE: base failure becomes a documented condition', () => {
    const r = evaluateShelfLifeRule(
      {
        kind: 'EXEMPTION_AVAILABLE',
        base: { kind: 'ABSOLUTE_MONTHS', minMonths: 12 },
        exemptionNote: 'Hospital emergency import waiver possible',
      },
      lifeShort,
    );
    expect(r.outcome).toBe('CONDITIONAL');
    if (r.outcome === 'CONDITIONAL') expect(r.condition).toContain('waiver');
  });
  it('EXEMPTION_AVAILABLE: base pass stays a pass', () => {
    const r = evaluateShelfLifeRule(
      { kind: 'EXEMPTION_AVAILABLE', base: { kind: 'ABSOLUTE_MONTHS', minMonths: 6 }, exemptionNote: 'n/a' },
      lifeKnownOriginal,
    );
    expect(r.outcome).toBe('PASS');
  });
});
