import type { ShelfLifeRulePayload } from '../shelf-life/types';

// Snapshot inputs — the caller (service layer) assembles these from the
// database; the engine itself performs no I/O.

export type CheckSeverity = 'BLOCK' | 'CONDITION' | 'REVIEW' | 'MISSING' | 'INFO';

export interface Reason {
  code: string;
  severity: CheckSeverity;
  params?: Record<string, unknown>;
}

export interface LicenseSnapshot {
  type: string;
  status: 'PENDING_REVIEW' | 'VERIFIED' | 'REJECTED' | 'EXPIRED' | 'SUSPENDED';
  expiryDate: Date;
}

export interface OrgSnapshot {
  id: string;
  status: 'DRAFT' | 'PENDING_KYB' | 'VERIFIED' | 'REJECTED' | 'SUSPENDED';
  sanctionsResult: 'NOT_SCREENED' | 'CLEAR' | 'REVIEW' | 'BLOCKED';
  sanctionsCheckedAt?: Date | null;
  licenses: LicenseSnapshot[];
}

export interface BuyerSnapshot extends OrgSnapshot {
  importPermits: Array<{
    countryId: string;
    productId: string | null;
    status: 'PENDING' | 'SUBMITTED' | 'VERIFIED' | 'REJECTED' | 'EXPIRED';
    expiryDate: Date | null;
  }>;
  warehouseCapabilities: { ambient: boolean; cold2to8: boolean; frozen: boolean; controlledRoom: boolean };
  monthlyConsumptionUnits?: number | null;
  requestedQuantity?: number | null;
}

export interface ProductSnapshot {
  id: string;
  status: 'DRAFT' | 'PENDING_REVIEW' | 'VERIFIED' | 'SUSPENDED';
  atcCode?: string | null;
  dosageForm?: string | null;
  controlledStatus: 'NONE' | 'NARCOTIC' | 'PSYCHOTROPIC' | 'OTHER_CONTROLLED' | 'UNKNOWN';
  coldChain: boolean;
  temperatureMode: 'AMBIENT' | 'COLD_2_8' | 'FROZEN' | 'CONTROLLED_ROOM';
  serializationRequired: boolean;
}

export interface BatchSnapshot {
  id: string;
  expiryDate: Date;
  manufacturingDate?: Date | null;
  originalShelfLifeMonths?: number | null;
  quantity: number;
  recallStatus: 'NONE' | 'SUSPECTED' | 'RECALLED';
  quarantineStatus: 'NONE' | 'QUARANTINED' | 'RELEASED';
  qualityStatus: 'UNVERIFIED' | 'VERIFIED' | 'REJECTED';
}

export type RuleVersionStatus =
  | 'DRAFT'
  | 'PENDING_VERIFICATION'
  | 'VERIFIED'
  | 'OUTDATED'
  | 'CONFLICTING_SOURCES'
  | 'REQUIRES_LOCAL_COUNSEL'
  | 'SUSPENDED'
  | 'DEMO';

export interface ShelfLifeRuleSnapshot {
  id: string;
  status: RuleVersionStatus;
  payload: ShelfLifeRulePayload;
}

export interface DestinationSnapshot {
  countryId: string;
  tradeStatus: 'NOT_TRADE_ENABLED' | 'RESEARCH_IN_PROGRESS' | 'TRADE_ENABLED' | 'SUSPENDED';
  productRegistration: 'UNKNOWN' | 'REGISTERED' | 'NOT_REGISTERED' | 'PENDING' | 'EXEMPT_POSSIBLE';
  shelfLifeRule: ShelfLifeRuleSnapshot | null;
  /** null = unknown (→ human review); true/false = verified requirement. */
  importPermitRequired: boolean | null;
  requiredDocumentCodes: string[];
  shippingDays: number;
  customsBufferDays: number;
  operationalBufferDays: number;
}

export interface EligibilityConfig {
  /** Product classes excluded from the platform in the current phase (config, not code). */
  excludedControlledStatuses: string[];
  /** MVP: cold-chain trades require human review instead of flowing automatically. */
  allowColdChain: boolean;
  /** Sanctions screening older than this is stale and requires re-review. */
  sanctionsMaxAgeDays: number;
  engineVersion: string;
}

export interface EligibilityInput {
  today: Date;
  batch: BatchSnapshot;
  product: ProductSnapshot;
  seller: OrgSnapshot;
  /** Absent for listing-level (country-only) evaluation. */
  buyer?: BuyerSnapshot | null;
  destination: DestinationSnapshot;
  /** Document type codes already on file and verified for this batch/deal. */
  availableDocumentCodes?: string[];
  config: EligibilityConfig;
}

export type EligibilityVerdict =
  | 'ELIGIBLE'
  | 'CONDITIONALLY_ELIGIBLE'
  | 'INELIGIBLE'
  | 'HUMAN_REVIEW_REQUIRED'
  | 'INSUFFICIENT_DATA';

export interface EligibilityResult {
  verdict: EligibilityVerdict;
  reasons: Reason[];
  blockingIssues: string[];
  conditions: string[];
  requiredDocuments: string[];
  requiredPermits: string[];
  projectedArrivalDate: Date;
  arrivalShelfLifeDays: number;
  arrivalShelfLifeMonths: number;
  arrivalShelfLifePercent: number | null;
  requiresHumanReview: boolean;
  engineVersion: string;
  ruleVersionIds: string[];
}
