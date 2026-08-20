// FastLane classification (spec §23) — "eligible inventory can often be
// delivered internationally in under 14 days" is a capability class, never a
// universal guarantee.

export interface FastLaneInput {
  productRegistered: boolean;
  buyerFullyVerified: boolean;
  importAuthorizationOnFile: boolean;
  sellerVerified: boolean;
  documentsComplete: boolean;
  batchQualityVerified: boolean;
  airRouteAvailable: boolean;
  customsProcessKnown: boolean;
  paymentPreApproved: boolean;
  temperatureManageable: boolean;
  estimatedDeliveryDays: number | null;
}

export type FastLaneStatus = 'FASTLANE_ELIGIBLE' | 'FASTLANE_CONDITIONAL' | 'NOT_FASTLANE';

export interface FastLaneResult {
  status: FastLaneStatus;
  missing: string[];
}

/** Gaps a counterparty can realistically close pre-shipment. */
const RECOVERABLE: ReadonlySet<string> = new Set([
  'documentsComplete',
  'importAuthorizationOnFile',
  'paymentPreApproved',
  'batchQualityVerified',
]);

export function classifyFastLane(input: FastLaneInput): FastLaneResult {
  const missing: string[] = [];
  for (const [key, value] of Object.entries(input)) {
    if (key === 'estimatedDeliveryDays') continue;
    if (value !== true) missing.push(key);
  }
  if (input.estimatedDeliveryDays === null) missing.push('estimatedDeliveryDays');
  else if (input.estimatedDeliveryDays >= 14) missing.push('deliveryUnder14Days');

  if (missing.length === 0) return { status: 'FASTLANE_ELIGIBLE', missing };
  if (missing.every((m) => RECOVERABLE.has(m))) return { status: 'FASTLANE_CONDITIONAL', missing };
  return { status: 'NOT_FASTLANE', missing };
}
