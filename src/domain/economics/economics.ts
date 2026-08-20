import Decimal from 'decimal.js';

// Financial calculations use Decimal exclusively — floating point is forbidden
// for money (spec §48). Rounding: 2 decimal places, ROUND_HALF_UP, applied to
// outputs only.

Decimal.set({ precision: 40 });

export type Money = Decimal;
const D = (v: Decimal.Value): Decimal => new Decimal(v);
const round2 = (v: Decimal): Decimal => v.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

export interface DealEconomicsInput {
  unitPrice: Decimal.Value;
  quantity: number;
  /** e.g. 5 for 5% — platform commission charged to the seller. Configuration, never hardcoded. */
  sellerCommissionPercent: Decimal.Value;
  /** Optional buyer-side platform fee percent. */
  buyerFeePercent?: Decimal.Value;
  logisticsCost?: Decimal.Value;
  insuranceCost?: Decimal.Value;
  customsEstimate?: Decimal.Value;
  taxEstimate?: Decimal.Value;
  paymentFees?: Decimal.Value;
  documentationFee?: Decimal.Value;
  /** Sourced reference for what the buyer would otherwise pay — null when unknown. */
  alternativeProcurementCost?: Decimal.Value | null;
}

export interface DealEconomics {
  subtotal: Decimal;
  commissionAmount: Decimal;
  buyerFeeAmount: Decimal;
  logisticsCost: Decimal;
  insuranceCost: Decimal;
  customsEstimate: Decimal;
  taxEstimate: Decimal;
  paymentFees: Decimal;
  documentationFee: Decimal;
  buyerLandedCost: Decimal;
  sellerPayout: Decimal;
  platformRevenue: Decimal;
  /** Null when no sourced reference exists — the UI shows "insufficient pricing data". */
  estimatedBuyerSavings: Decimal | null;
}

export function computeDealEconomics(input: DealEconomicsInput): DealEconomics {
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
    throw new Error('quantity must be a positive integer');
  }
  const unitPrice = D(input.unitPrice);
  if (unitPrice.isNegative()) throw new Error('unitPrice must not be negative');

  const subtotal = round2(unitPrice.times(input.quantity));
  const commissionAmount = round2(subtotal.times(D(input.sellerCommissionPercent)).div(100));
  const buyerFeeAmount = round2(subtotal.times(D(input.buyerFeePercent ?? 0)).div(100));
  const logisticsCost = round2(D(input.logisticsCost ?? 0));
  const insuranceCost = round2(D(input.insuranceCost ?? 0));
  const customsEstimate = round2(D(input.customsEstimate ?? 0));
  const taxEstimate = round2(D(input.taxEstimate ?? 0));
  const paymentFees = round2(D(input.paymentFees ?? 0));
  const documentationFee = round2(D(input.documentationFee ?? 0));

  const buyerLandedCost = round2(
    subtotal
      .plus(buyerFeeAmount)
      .plus(logisticsCost)
      .plus(insuranceCost)
      .plus(customsEstimate)
      .plus(taxEstimate)
      .plus(paymentFees)
      .plus(documentationFee),
  );
  const sellerPayout = round2(subtotal.minus(commissionAmount));
  const platformRevenue = round2(commissionAmount.plus(buyerFeeAmount).plus(documentationFee));

  const estimatedBuyerSavings =
    input.alternativeProcurementCost === null || input.alternativeProcurementCost === undefined
      ? null
      : round2(D(input.alternativeProcurementCost).minus(buyerLandedCost));

  return {
    subtotal, commissionAmount, buyerFeeAmount, logisticsCost, insuranceCost,
    customsEstimate, taxEstimate, paymentFees, documentationFee,
    buyerLandedCost, sellerPayout, platformRevenue, estimatedBuyerSavings,
  };
}
