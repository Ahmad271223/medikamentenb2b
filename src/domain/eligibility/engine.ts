import { diffDaysUtc } from '../dates';
import { calculateShelfLife, projectArrivalDate } from '../shelf-life/shelf-life';
import { evaluateShelfLifeRule } from '../shelf-life/rules';
import type { EligibilityInput, EligibilityResult, Reason } from './types';

export const ELIGIBILITY_ENGINE_VERSION = '1.0.0';

const AVERAGE_DAYS_PER_MONTH = 30.44; // used only for consumption estimates, never for rule checks

/**
 * The core of the platform: evaluates one batch against one destination.
 * Pure function — assemble snapshots outside, persist the result outside.
 *
 * Safety invariants (tested):
 *  - hard blocks (recall, expired license, sanctions BLOCKED, …) ⇒ INELIGIBLE
 *  - missing data ⇒ INSUFFICIENT_DATA, never a guess
 *  - unverified/DEMO rules or open questions ⇒ HUMAN_REVIEW_REQUIRED
 *  - only a fully verified, unconditional case returns ELIGIBLE
 */
export function evaluateBatchForDestination(input: EligibilityInput): EligibilityResult {
  const reasons: Reason[] = [];
  const requiredDocuments = new Set<string>();
  const requiredPermits = new Set<string>();
  const ruleVersionIds: string[] = [];
  const { batch, product, seller, buyer, destination, config, today } = input;

  // ── 1 Seller authorization ────────────────────────────────────────────
  if (seller.status === 'SUSPENDED' || seller.status === 'REJECTED') {
    reasons.push({ code: 'SELLER_ORG_BLOCKED', severity: 'BLOCK', params: { status: seller.status } });
  } else if (seller.status !== 'VERIFIED') {
    reasons.push({ code: 'SELLER_ORG_NOT_VERIFIED', severity: 'BLOCK', params: { status: seller.status } });
  }
  const sellerTradeLicenses = seller.licenses.filter((l) =>
    ['WDA', 'WHOLESALE', 'MANUFACTURING', 'PHARMACY', 'HOSPITAL'].includes(l.type),
  );
  if (sellerTradeLicenses.length === 0) {
    reasons.push({ code: 'SELLER_LICENSE_MISSING', severity: 'BLOCK' });
  } else {
    const valid = sellerTradeLicenses.some(
      (l) => l.status === 'VERIFIED' && l.expiryDate.getTime() > today.getTime(),
    );
    if (!valid) {
      const expired = sellerTradeLicenses.some((l) => l.expiryDate.getTime() <= today.getTime());
      reasons.push({
        code: expired ? 'SELLER_LICENSE_EXPIRED' : 'SELLER_LICENSE_NOT_VERIFIED',
        severity: 'BLOCK',
      });
    }
  }

  // ── 2 Buyer authorization (when a concrete buyer is in scope) ─────────
  if (buyer) {
    if (buyer.status === 'SUSPENDED' || buyer.status === 'REJECTED') {
      reasons.push({ code: 'BUYER_ORG_BLOCKED', severity: 'BLOCK', params: { status: buyer.status } });
    } else if (buyer.status !== 'VERIFIED') {
      reasons.push({ code: 'BUYER_ORG_NOT_VERIFIED', severity: 'BLOCK', params: { status: buyer.status } });
    }
    const buyerLicenses = buyer.licenses.filter((l) =>
      ['WDA', 'WHOLESALE', 'IMPORT', 'HOSPITAL', 'PHARMACY'].includes(l.type),
    );
    if (buyerLicenses.length === 0) {
      reasons.push({ code: 'BUYER_LICENSE_MISSING', severity: 'BLOCK' });
    } else if (!buyerLicenses.some((l) => l.status === 'VERIFIED' && l.expiryDate.getTime() > today.getTime())) {
      reasons.push({ code: 'BUYER_LICENSE_NOT_VALID', severity: 'BLOCK' });
    }
  }

  // ── 3 Product identity ────────────────────────────────────────────────
  if (product.status === 'SUSPENDED') {
    reasons.push({ code: 'PRODUCT_SUSPENDED', severity: 'BLOCK' });
  } else if (product.status !== 'VERIFIED') {
    reasons.push({ code: 'PRODUCT_NOT_VERIFIED', severity: 'REVIEW', params: { status: product.status } });
  }

  // ── 4 Batch integrity ─────────────────────────────────────────────────
  if (batch.quantity <= 0) {
    reasons.push({ code: 'BATCH_NO_QUANTITY', severity: 'BLOCK' });
  }
  if (batch.qualityStatus === 'REJECTED') {
    reasons.push({ code: 'BATCH_QUALITY_REJECTED', severity: 'BLOCK' });
  } else if (batch.qualityStatus === 'UNVERIFIED') {
    reasons.push({ code: 'BATCH_QUALITY_UNVERIFIED', severity: 'REVIEW' });
  }

  // ── 5 Recall / quarantine — absolute blocks ──────────────────────────
  if (batch.recallStatus === 'RECALLED') {
    reasons.push({ code: 'BATCH_RECALLED', severity: 'BLOCK' });
  } else if (batch.recallStatus === 'SUSPECTED') {
    reasons.push({ code: 'BATCH_RECALL_SUSPECTED', severity: 'BLOCK' });
  }
  if (batch.quarantineStatus === 'QUARANTINED') {
    reasons.push({ code: 'BATCH_QUARANTINED', severity: 'BLOCK' });
  }

  // ── 6 Controlled / excluded product classes (configuration) ──────────
  if (product.controlledStatus === 'UNKNOWN') {
    reasons.push({ code: 'CONTROLLED_STATUS_UNKNOWN', severity: 'MISSING' });
  } else if (config.excludedControlledStatuses.includes(product.controlledStatus)) {
    reasons.push({
      code: 'PRODUCT_CLASS_EXCLUDED',
      severity: 'BLOCK',
      params: { controlledStatus: product.controlledStatus },
    });
  }

  // ── 7 Sanctions ───────────────────────────────────────────────────────
  const sanctionsSubjects: Array<['SELLER' | 'BUYER', typeof seller]> = [['SELLER', seller]];
  if (buyer) sanctionsSubjects.push(['BUYER', buyer]);
  for (const [side, org] of sanctionsSubjects) {
    if (org.sanctionsResult === 'BLOCKED') {
      reasons.push({ code: 'SANCTIONS_BLOCKED', severity: 'BLOCK', params: { side } });
    } else if (org.sanctionsResult === 'REVIEW') {
      reasons.push({ code: 'SANCTIONS_REVIEW', severity: 'REVIEW', params: { side } });
    } else if (org.sanctionsResult === 'NOT_SCREENED') {
      reasons.push({ code: 'SANCTIONS_NOT_SCREENED', severity: 'REVIEW', params: { side } });
    } else if (
      org.sanctionsCheckedAt &&
      diffDaysUtc(today, org.sanctionsCheckedAt) > config.sanctionsMaxAgeDays
    ) {
      reasons.push({ code: 'SANCTIONS_CHECK_STALE', severity: 'REVIEW', params: { side } });
    }
  }

  // ── 8 Destination country trade status ───────────────────────────────
  if (destination.tradeStatus === 'SUSPENDED') {
    reasons.push({ code: 'COUNTRY_TRADE_SUSPENDED', severity: 'BLOCK' });
  } else if (destination.tradeStatus !== 'TRADE_ENABLED') {
    reasons.push({ code: 'COUNTRY_NOT_TRADE_ENABLED', severity: 'REVIEW', params: { tradeStatus: destination.tradeStatus } });
  }

  // ── 9 Product registration in destination ────────────────────────────
  switch (destination.productRegistration) {
    case 'REGISTERED':
      break;
    case 'NOT_REGISTERED':
      reasons.push({ code: 'PRODUCT_NOT_REGISTERED', severity: 'BLOCK' });
      break;
    case 'EXEMPT_POSSIBLE':
      reasons.push({ code: 'REGISTRATION_EXEMPTION_POSSIBLE', severity: 'CONDITION' });
      break;
    case 'PENDING':
      reasons.push({ code: 'REGISTRATION_PENDING', severity: 'REVIEW' });
      break;
    case 'UNKNOWN':
      reasons.push({ code: 'REGISTRATION_UNKNOWN', severity: 'MISSING' });
      break;
  }

  // ── 10 Shelf life at projected arrival ────────────────────────────────
  const projectedArrivalDate = projectArrivalDate({
    from: today,
    shippingDays: destination.shippingDays,
    customsBufferDays: destination.customsBufferDays,
    operationalBufferDays: destination.operationalBufferDays,
  });
  const lifeAtArrival = calculateShelfLife({
    expiryDate: batch.expiryDate,
    manufacturingDate: batch.manufacturingDate ?? null,
    originalShelfLifeMonths: batch.originalShelfLifeMonths ?? null,
    atDate: projectedArrivalDate,
  });

  if (lifeAtArrival.daysRemaining <= 0) {
    reasons.push({ code: 'EXPIRED_AT_ARRIVAL', severity: 'BLOCK', params: { daysRemaining: lifeAtArrival.daysRemaining } });
  }

  const shelfRule = destination.shelfLifeRule;
  if (!shelfRule) {
    reasons.push({ code: 'SHELF_LIFE_RULE_MISSING', severity: 'REVIEW' });
  } else {
    ruleVersionIds.push(shelfRule.id);
    if (shelfRule.status !== 'VERIFIED') {
      reasons.push({ code: 'SHELF_LIFE_RULE_UNVERIFIED', severity: 'REVIEW', params: { status: shelfRule.status } });
    }
    const outcome = evaluateShelfLifeRule(shelfRule.payload, lifeAtArrival, {
      atcCode: product.atcCode,
      dosageForm: product.dosageForm,
      coldChain: product.coldChain,
      controlled: product.controlledStatus !== 'NONE' && product.controlledStatus !== 'UNKNOWN',
    });
    switch (outcome.outcome) {
      case 'PASS':
        reasons.push({ code: outcome.code, severity: 'INFO', params: outcome.params });
        break;
      case 'FAIL':
        reasons.push({ code: outcome.code, severity: 'BLOCK', params: outcome.params });
        break;
      case 'CONDITIONAL':
        reasons.push({ code: outcome.code, severity: 'CONDITION', params: { condition: outcome.condition, ...outcome.params } });
        break;
      case 'HUMAN_REVIEW':
        reasons.push({ code: outcome.code, severity: 'REVIEW', params: outcome.params });
        break;
      case 'INSUFFICIENT_DATA':
        reasons.push({ code: outcome.code, severity: 'MISSING', params: outcome.params });
        break;
    }
  }

  // ── 11 Import permit ──────────────────────────────────────────────────
  if (destination.importPermitRequired === null) {
    reasons.push({ code: 'IMPORT_PERMIT_REQUIREMENT_UNKNOWN', severity: 'MISSING' });
  } else if (destination.importPermitRequired) {
    requiredPermits.add('IMPORT_PERMIT');
    if (buyer) {
      const permit = buyer.importPermits.find(
        (p) =>
          p.countryId === destination.countryId &&
          (p.productId === null || p.productId === product.id) &&
          p.status === 'VERIFIED' &&
          (p.expiryDate === null || p.expiryDate.getTime() > today.getTime()),
      );
      if (!permit) {
        reasons.push({ code: 'IMPORT_PERMIT_MISSING', severity: 'CONDITION' });
      }
    } else {
      reasons.push({ code: 'IMPORT_PERMIT_REQUIRED', severity: 'CONDITION' });
    }
  }

  // ── 12 Storage / cold chain ───────────────────────────────────────────
  if (product.coldChain || product.temperatureMode === 'COLD_2_8' || product.temperatureMode === 'FROZEN') {
    if (!config.allowColdChain) {
      reasons.push({ code: 'COLD_CHAIN_REQUIRES_REVIEW', severity: 'REVIEW' });
    }
    if (buyer) {
      const capable =
        (product.temperatureMode === 'COLD_2_8' && buyer.warehouseCapabilities.cold2to8) ||
        (product.temperatureMode === 'FROZEN' && buyer.warehouseCapabilities.frozen) ||
        (product.temperatureMode === 'CONTROLLED_ROOM' && buyer.warehouseCapabilities.controlledRoom) ||
        product.temperatureMode === 'AMBIENT';
      if (!capable) {
        reasons.push({ code: 'BUYER_STORAGE_INCAPABLE', severity: 'BLOCK', params: { required: product.temperatureMode } });
      }
    }
  }

  // ── 13 Consumption feasibility (spec §57) ─────────────────────────────
  if (buyer?.monthlyConsumptionUnits && buyer.requestedQuantity) {
    const consumptionDays = Math.ceil(
      (buyer.requestedQuantity / buyer.monthlyConsumptionUnits) * AVERAGE_DAYS_PER_MONTH,
    );
    if (consumptionDays > lifeAtArrival.daysRemaining) {
      reasons.push({
        code: 'CONSUMPTION_INFEASIBLE',
        severity: 'BLOCK',
        params: { consumptionDays, arrivalShelfLifeDays: lifeAtArrival.daysRemaining },
      });
    }
  }

  // ── 14 Required documents ─────────────────────────────────────────────
  const available = new Set(input.availableDocumentCodes ?? []);
  for (const code of destination.requiredDocumentCodes) {
    requiredDocuments.add(code);
    if (!available.has(code)) {
      reasons.push({ code: 'DOCUMENT_MISSING', severity: 'CONDITION', params: { documentCode: code } });
    }
  }

  // ── Aggregate — hard blocks dominate; uncertainty never upgrades ─────
  const has = (severity: Reason['severity']) => reasons.some((r) => r.severity === severity);
  let verdict: EligibilityResult['verdict'];
  if (has('BLOCK')) verdict = 'INELIGIBLE';
  else if (has('MISSING')) verdict = 'INSUFFICIENT_DATA';
  else if (has('REVIEW')) verdict = 'HUMAN_REVIEW_REQUIRED';
  else if (has('CONDITION')) verdict = 'CONDITIONALLY_ELIGIBLE';
  else verdict = 'ELIGIBLE';

  // Belt and braces: ELIGIBLE requires a verified shelf-life rule to exist.
  if (verdict === 'ELIGIBLE' && (!shelfRule || shelfRule.status !== 'VERIFIED')) {
    verdict = 'HUMAN_REVIEW_REQUIRED';
    reasons.push({ code: 'RULESET_NOT_FULLY_VERIFIED', severity: 'REVIEW' });
  }

  return {
    verdict,
    reasons,
    blockingIssues: reasons.filter((r) => r.severity === 'BLOCK').map((r) => r.code),
    conditions: reasons.filter((r) => r.severity === 'CONDITION').map((r) => r.code),
    requiredDocuments: [...requiredDocuments],
    requiredPermits: [...requiredPermits],
    projectedArrivalDate,
    arrivalShelfLifeDays: lifeAtArrival.daysRemaining,
    arrivalShelfLifeMonths: lifeAtArrival.monthsRemaining,
    arrivalShelfLifePercent: lifeAtArrival.percentRemaining,
    requiresHumanReview: verdict === 'HUMAN_REVIEW_REQUIRED' || verdict === 'INSUFFICIENT_DATA',
    engineVersion: config.engineVersion,
    ruleVersionIds,
  };
}
