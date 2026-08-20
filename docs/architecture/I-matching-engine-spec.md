# PART I — Matching & Eligibility Engine Specification

Implementation: `src/domain/eligibility/engine.ts` (pure function — caller assembles a DB snapshot, engine never touches I/O). Engine version string is persisted with every verdict.

## 1. `evaluateBatchForDestination` — pseudocode

```text
function evaluateBatchForDestination(input):
    checks = []

    # 1 Hard identity & integrity
    checks += verifySellerAuthorization(seller)        # org VERIFIED, license VERIFIED & unexpired  → BLOCK on failure
    checks += verifyBuyerAuthorization(buyer?)         # when buyer known: license/import authority   → BLOCK / REVIEW
    checks += verifyProductIdentity(product)           # product status VERIFIED                      → REVIEW if draft
    checks += verifyBatchIntegrity(batch)              # expiry present, quantity > 0, quality status → BLOCK / REVIEW
    checks += checkRecall(batch)                       # recalled/quarantined                         → BLOCK (absolute)
    checks += checkControlledStatus(product, config)   # excluded classes (MVP: controlled, biologic…)→ BLOCK (config)
    checks += checkSanctions(latestChecks)             # BLOCKED → BLOCK; REVIEW → REVIEW; stale/missing → REVIEW

    # 2 Destination regulatory position
    checks += checkCountryTradeStatus(destination)     # NOT_TRADE_ENABLED → REVIEW (never eligible)
    checks += determineProductRegistration(reg)        # REGISTERED ok; NOT_REGISTERED → BLOCK unless
                                                       # verified exemption; UNKNOWN → INSUFFICIENT_DATA
    rules  = loadLatestVerifiedCountryRules(destination)
    checks += assertRuleVerification(rules)            # any DEMO/PENDING/OUTDATED/CONFLICTING → REVIEW

    # 3 Shelf life on PROJECTED ARRIVAL (never order date)
    arrival = today + shippingDays(country|default)
                    + customsBufferDays(country|default)
                    + operationalBufferDays(config)
    life    = remainingShelfLife(batch, at = arrival)  # days, calendar months, % of original (if known)
    checks += evaluateShelfLifeRule(rules.shelfLife, life)
                                                       # FAIL → BLOCK with explanation; percentage rule
                                                       # without original shelf life → INSUFFICIENT_DATA

    # 4 Operational feasibility
    checks += verifyImportPermit(permits, rules)       # required & missing → CONDITION (pre-trade) /
                                                       # BLOCK (pre-shipment)
    checks += verifyStorageCompatibility(batch, buyer) # cold chain vs warehouse capability → BLOCK / CONDITION
    checks += verifyLogisticsFeasibility(route)        # no viable route/temperature transport → BLOCK
    checks += verifyConsumptionFeasibility(demand)     # monthly usage × window < quantity → REVIEW (§57:
                                                       # arrival + practical use window must fit expiry → BLOCK)
    checks += verifyRequiredDocuments(docs, rules)     # missing → CONDITION (listed by code)

    # 5 Aggregate — uncertainty never upgrades
    if any(check.severity == BLOCK):            return INELIGIBLE(reasons)
    if any(check.kind == MISSING_DATA):         return INSUFFICIENT_DATA(reasons)
    if any(check.severity == REVIEW):           return HUMAN_REVIEW_REQUIRED(reasons)
    if any(check.severity == CONDITION):        return CONDITIONALLY_ELIGIBLE(reasons, conditions)
    if not allRuleVersionsVerified(rules):      return HUMAN_REVIEW_REQUIRED(reasons)   # belt & braces
    return ELIGIBLE(reasons)
```

### Result shape (actual TypeScript)

```ts
{
  verdict: 'ELIGIBLE' | 'CONDITIONALLY_ELIGIBLE' | 'INELIGIBLE' | 'HUMAN_REVIEW_REQUIRED' | 'INSUFFICIENT_DATA',
  reasons: Array<{ code: string; severity: 'BLOCK'|'CONDITION'|'REVIEW'|'INFO'; params?: Record<string,unknown> }>,
  blockingIssues: string[], conditions: string[],
  requiredDocuments: string[], requiredPermits: string[],
  projectedArrivalDate: ISODate,
  arrivalShelfLifeDays: number, arrivalShelfLifeMonths: number,
  arrivalShelfLifePercent: number | null,       // null when original shelf life unknown
  requiresHumanReview: boolean,
  engineVersion: string, ruleVersionIds: string[]
}
```

Reasons are **codes + params**; the UI localizes them (de/en/ar). Every rejection explains *why* (§53).

## 2. Match score (§54)

Regulatory eligibility is a **gate, not a factor**: `INELIGIBLE`/blocked candidates are never scored or shown as opportunities, regardless of commercial attractiveness.

```
score = 100 × ( 0.40·eligibilityQuality   # ELIGIBLE=1.0, CONDITIONAL=0.6, else gate
              + 0.20·demandStrength        # RFQ quantity/recency/price headroom
              + 0.15·priceCompetitiveness  # vs sourced references only; neutral 0.5 if no data
              + 0.10·shelfLifeComfort      # margin above destination minimum
              + 0.10·logisticsFeasibility  # route, temperature, lead time vs requiredBy
              + 0.05·counterpartyReliability ) # trust metrics (PART A §trust)
```

Weights live in `PlatformConfig` (`match_score_weights`). Breakdown persisted on `Match.scoreBreakdown`.

## 3. FastLane classifier (§23)

`classifyFastLane(input)` → `FASTLANE_ELIGIBLE | FASTLANE_CONDITIONAL | NOT_FASTLANE` from checks: product registered, buyer fully verified, import authorization on file, seller verified, documents complete, batch quality verified, air route configured, customs process known, payment pre-approved, temperature manageable, projected delivery < 14 days. All checks must pass for ELIGIBLE; recoverable gaps → CONDITIONAL (listed); otherwise NOT_FASTLANE. Marketing copy must never claim a universal guarantee.
