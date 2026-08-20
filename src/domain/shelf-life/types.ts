// Shelf-life rule payloads — the typed contents of RegulatoryRuleVersion.payload
// for ruleType SHELF_LIFE. See docs/architecture/H-regulatory-rules-architecture.md

export interface ProductMatcher {
  atcPrefix?: string;
  dosageForm?: string;
  coldChain?: boolean;
  controlled?: boolean;
}

export type ShelfLifeRulePayload =
  | { kind: 'ABSOLUTE_MONTHS'; minMonths: number }
  | { kind: 'PERCENTAGE_OF_ORIGINAL'; minPercent: number }
  | {
      kind: 'COMBINED_RULE';
      minMonths: number;
      minPercent: number;
      combinator: 'AND' | 'OR' | 'WHICHEVER_GREATER';
    }
  | {
      kind: 'PRODUCT_SPECIFIC';
      rules: Array<{ match: ProductMatcher; rule: ShelfLifeRulePayload }>;
      fallback: ShelfLifeRulePayload;
    }
  | { kind: 'CASE_BY_CASE'; note?: string }
  | { kind: 'EXEMPTION_AVAILABLE'; base: ShelfLifeRulePayload; exemptionNote: string }
  | { kind: 'NO_VERIFIED_RULE' };

/** Product facts a PRODUCT_SPECIFIC matcher can look at. */
export interface MatchableProduct {
  atcCode?: string | null;
  dosageForm?: string | null;
  coldChain?: boolean;
  controlled?: boolean;
}

/** Shelf-life situation of a batch evaluated at a specific reference date. */
export interface ShelfLifeAtDate {
  atDate: Date;
  expiryDate: Date;
  /** Calendar days from atDate until expiry (negative when already expired). */
  daysRemaining: number;
  /** Full calendar months from atDate until expiry (floor). */
  monthsRemaining: number;
  /** Total shelf life in days, when derivable — otherwise null (never guessed). */
  originalShelfLifeDays: number | null;
  /** Remaining share of original shelf life in percent (0–100), null when original unknown. */
  percentRemaining: number | null;
}

export type ShelfLifeRuleOutcome =
  | { outcome: 'PASS'; code: string; params?: Record<string, unknown> }
  | { outcome: 'FAIL'; code: string; params?: Record<string, unknown> }
  | { outcome: 'CONDITIONAL'; code: string; condition: string; params?: Record<string, unknown> }
  | { outcome: 'HUMAN_REVIEW'; code: string; params?: Record<string, unknown> }
  | { outcome: 'INSUFFICIENT_DATA'; code: string; params?: Record<string, unknown> };
