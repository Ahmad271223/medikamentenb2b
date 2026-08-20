import Decimal from 'decimal.js';
import { describe, expect, it } from 'vitest';
import { computeDealEconomics } from './economics';

describe('computeDealEconomics', () => {
  it('spec §70 example: 2,000 × €12.00 at 5% commission', () => {
    const r = computeDealEconomics({
      unitPrice: '12.00',
      quantity: 2000,
      sellerCommissionPercent: 5,
      logisticsCost: '1800.00',
      insuranceCost: '120.00',
      customsEstimate: '450.00',
      paymentFees: '96.00',
    });
    expect(r.subtotal.toFixed(2)).toBe('24000.00');
    expect(r.commissionAmount.toFixed(2)).toBe('1200.00');
    expect(r.sellerPayout.toFixed(2)).toBe('22800.00');
    expect(r.buyerLandedCost.toFixed(2)).toBe('26466.00');
    expect(r.platformRevenue.toFixed(2)).toBe('1200.00');
  });

  it('is exact where binary floats are not (0.1 × 3)', () => {
    const r = computeDealEconomics({ unitPrice: '0.1', quantity: 3, sellerCommissionPercent: 0 });
    expect(r.subtotal.toFixed(2)).toBe('0.30');
    expect(r.subtotal.equals(new Decimal('0.3'))).toBe(true);
  });

  it('holds the invariant payout + commission = subtotal', () => {
    const r = computeDealEconomics({ unitPrice: '11.53', quantity: 1777, sellerCommissionPercent: '3.75' });
    expect(r.sellerPayout.plus(r.commissionAmount).equals(r.subtotal)).toBe(true);
  });

  it('rounds half-up to cents', () => {
    // 100.00 × 2.505% = 2.505 → 2.51
    const r = computeDealEconomics({ unitPrice: '100.00', quantity: 1, sellerCommissionPercent: '2.505' });
    expect(r.commissionAmount.toFixed(2)).toBe('2.51');
  });

  it('reports savings only against a sourced reference — otherwise null', () => {
    const withoutRef = computeDealEconomics({ unitPrice: '10', quantity: 100, sellerCommissionPercent: 5 });
    expect(withoutRef.estimatedBuyerSavings).toBeNull();

    const withRef = computeDealEconomics({
      unitPrice: '10',
      quantity: 100,
      sellerCommissionPercent: 5,
      alternativeProcurementCost: '1350.00',
    });
    expect(withRef.estimatedBuyerSavings?.toFixed(2)).toBe('350.00');
  });

  it('adds buyer-side fees to landed cost and platform revenue', () => {
    const r = computeDealEconomics({
      unitPrice: '10',
      quantity: 100,
      sellerCommissionPercent: 5,
      buyerFeePercent: 2,
      documentationFee: '25.00',
    });
    expect(r.buyerFeeAmount.toFixed(2)).toBe('20.00');
    expect(r.buyerLandedCost.toFixed(2)).toBe('1045.00');
    expect(r.platformRevenue.toFixed(2)).toBe('95.00'); // 50 + 20 + 25
  });

  it('rejects invalid quantities and negative prices', () => {
    expect(() => computeDealEconomics({ unitPrice: '1', quantity: 0, sellerCommissionPercent: 5 })).toThrow();
    expect(() => computeDealEconomics({ unitPrice: '1', quantity: 1.5, sellerCommissionPercent: 5 })).toThrow();
    expect(() => computeDealEconomics({ unitPrice: '-1', quantity: 1, sellerCommissionPercent: 5 })).toThrow();
  });
});
