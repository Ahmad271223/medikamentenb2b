// Pure derivation of match-score components (0–1 each) from listing/demand
// facts. Formulas are deliberately simple and documented — they feed
// computeMatchScore() whose weights are platform configuration.

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const AVERAGE_DAYS_PER_MONTH = 30.44;

/** How completely this listing can fill the demand (full fill = 1). */
export function deriveDemandStrength(requestedQuantity: number, availableQuantity: number): number {
  if (requestedQuantity <= 0) return 0;
  return clamp01(availableQuantity / requestedQuantity);
}

/**
 * Price headroom against the buyer's stated maximum. No stated maximum means
 * no data — the score layer treats null as neutral and flags it (never invents
 * market prices).
 */
export function derivePriceCompetitiveness(
  listingUnitPrice: number,
  demandMaxUnitPrice: number | null,
): number | null {
  if (demandMaxUnitPrice === null || demandMaxUnitPrice <= 0) return null;
  return clamp01((demandMaxUnitPrice - listingUnitPrice) / demandMaxUnitPrice);
}

/**
 * Margin above the required remaining shelf life at arrival: exactly meeting
 * the requirement scores 0.5, double the requirement scores 1.
 * Fallback requirement when the demand states none: 6 months.
 */
export function deriveShelfLifeComfort(
  arrivalShelfLifeDays: number,
  demandMinShelfLifeMonths: number | null,
): number {
  const requiredDays = (demandMinShelfLifeMonths ?? 6) * AVERAGE_DAYS_PER_MONTH;
  if (requiredDays <= 0) return 1;
  return clamp01(arrivalShelfLifeDays / (2 * requiredDays));
}

/** Can the projected arrival meet the buyer's deadline? Unknown deadline = 0.7. */
export function deriveLogisticsFeasibility(projectedArrivalDate: Date, requiredBy: Date | null): number {
  if (!requiredBy) return 0.7;
  return projectedArrivalDate.getTime() <= requiredBy.getTime() ? 1 : 0.2;
}

/** No transaction history exists yet — honest neutral until trust metrics ship (M5). */
export const NEUTRAL_RELIABILITY = 0.5;
