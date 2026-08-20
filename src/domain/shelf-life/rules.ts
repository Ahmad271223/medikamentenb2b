import { meetsMinimumMonths } from './shelf-life';
import type {
  MatchableProduct,
  ProductMatcher,
  ShelfLifeAtDate,
  ShelfLifeRuleOutcome,
  ShelfLifeRulePayload,
} from './types';

function matcherApplies(matcher: ProductMatcher, product: MatchableProduct): boolean {
  if (matcher.atcPrefix !== undefined) {
    if (!product.atcCode || !product.atcCode.toUpperCase().startsWith(matcher.atcPrefix.toUpperCase())) return false;
  }
  if (matcher.dosageForm !== undefined) {
    if (!product.dosageForm || product.dosageForm.toLowerCase() !== matcher.dosageForm.toLowerCase()) return false;
  }
  if (matcher.coldChain !== undefined && (product.coldChain ?? false) !== matcher.coldChain) return false;
  if (matcher.controlled !== undefined && (product.controlled ?? false) !== matcher.controlled) return false;
  return true;
}

function evaluateMonths(life: ShelfLifeAtDate, minMonths: number): ShelfLifeRuleOutcome {
  const pass = meetsMinimumMonths(life.expiryDate, life.atDate, minMonths);
  return pass
    ? { outcome: 'PASS', code: 'SHELF_LIFE_MONTHS_OK', params: { minMonths, monthsRemaining: life.monthsRemaining } }
    : {
        outcome: 'FAIL',
        code: 'SHELF_LIFE_BELOW_MIN_MONTHS',
        params: { minMonths, monthsRemaining: life.monthsRemaining, daysRemaining: life.daysRemaining },
      };
}

function evaluatePercent(life: ShelfLifeAtDate, minPercent: number): ShelfLifeRuleOutcome {
  if (life.percentRemaining === null) {
    return {
      outcome: 'INSUFFICIENT_DATA',
      code: 'ORIGINAL_SHELF_LIFE_UNKNOWN',
      params: { minPercent },
    };
  }
  const pass = life.percentRemaining >= minPercent;
  return pass
    ? { outcome: 'PASS', code: 'SHELF_LIFE_PERCENT_OK', params: { minPercent, percentRemaining: life.percentRemaining } }
    : {
        outcome: 'FAIL',
        code: 'SHELF_LIFE_BELOW_MIN_PERCENT',
        params: { minPercent, percentRemaining: life.percentRemaining },
      };
}

const OUTCOME_RANK: Record<ShelfLifeRuleOutcome['outcome'], number> = {
  PASS: 0,
  CONDITIONAL: 1,
  HUMAN_REVIEW: 2,
  INSUFFICIENT_DATA: 3,
  FAIL: 4,
};

function worseOf(a: ShelfLifeRuleOutcome, b: ShelfLifeRuleOutcome): ShelfLifeRuleOutcome {
  return OUTCOME_RANK[a.outcome] >= OUTCOME_RANK[b.outcome] ? a : b;
}

/**
 * Evaluates a destination shelf-life rule against the shelf-life situation at
 * the projected arrival date. Uncertainty is never upgraded: unknown original
 * shelf life under a percentage rule yields INSUFFICIENT_DATA, CASE_BY_CASE and
 * NO_VERIFIED_RULE always require a human.
 */
export function evaluateShelfLifeRule(
  rule: ShelfLifeRulePayload,
  life: ShelfLifeAtDate,
  product: MatchableProduct = {},
): ShelfLifeRuleOutcome {
  switch (rule.kind) {
    case 'ABSOLUTE_MONTHS':
      return evaluateMonths(life, rule.minMonths);

    case 'PERCENTAGE_OF_ORIGINAL':
      return evaluatePercent(life, rule.minPercent);

    case 'COMBINED_RULE': {
      const months = evaluateMonths(life, rule.minMonths);
      const percent = evaluatePercent(life, rule.minPercent);
      if (rule.combinator === 'OR') {
        if (months.outcome === 'PASS' || percent.outcome === 'PASS') {
          return { outcome: 'PASS', code: 'SHELF_LIFE_COMBINED_OR_OK', params: { minMonths: rule.minMonths, minPercent: rule.minPercent } };
        }
        // Neither side passed. If one side is unknowable the batch might still
        // satisfy it — that is missing data, not a definitive failure.
        if (months.outcome === 'INSUFFICIENT_DATA') return months;
        if (percent.outcome === 'INSUFFICIENT_DATA') return percent;
        return worseOf(months, percent);
      }
      // AND and WHICHEVER_GREATER: the stricter requirement governs — both must hold.
      if (months.outcome === 'PASS' && percent.outcome === 'PASS') {
        return { outcome: 'PASS', code: 'SHELF_LIFE_COMBINED_OK', params: { minMonths: rule.minMonths, minPercent: rule.minPercent, combinator: rule.combinator } };
      }
      return worseOf(months, percent);
    }

    case 'PRODUCT_SPECIFIC': {
      const specific = rule.rules.find((entry) => matcherApplies(entry.match, product));
      return evaluateShelfLifeRule(specific ? specific.rule : rule.fallback, life, product);
    }

    case 'CASE_BY_CASE':
      return { outcome: 'HUMAN_REVIEW', code: 'SHELF_LIFE_CASE_BY_CASE', params: rule.note ? { note: rule.note } : undefined };

    case 'EXEMPTION_AVAILABLE': {
      const base = evaluateShelfLifeRule(rule.base, life, product);
      if (base.outcome === 'FAIL') {
        return {
          outcome: 'CONDITIONAL',
          code: 'SHELF_LIFE_EXEMPTION_PATH',
          condition: rule.exemptionNote,
          params: { baseFailure: base.code, ...base.params },
        };
      }
      return base;
    }

    case 'NO_VERIFIED_RULE':
      return { outcome: 'HUMAN_REVIEW', code: 'SHELF_LIFE_RULE_NOT_VERIFIED' };
  }
}
