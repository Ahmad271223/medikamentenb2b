# PART H — Regulatory Rules Architecture

## 1. Data structure

```
Country (tradeStatus: NOT_TRADE_ENABLED by default)
 └── RegulatoryRule (stable identity: country × ruleType [× productScope])
      ├── currentVersionId ──► RegulatoryRuleVersion vN   (status: VERIFIED)
      ├── RegulatoryRuleVersion vN-1  (superseded, immutable)
      └── RegulatoryRuleVersion vN-2  (superseded, immutable)
```

Every `RegulatoryRuleVersion` row carries the full provenance block required by the spec:
jurisdiction (via rule→country), rule type, payload, official source name, source URL, authority,
publication date, effective date, last-verified date, verifier (user id), confidence
(HIGH/MEDIUM/LOW/UNVERIFIED), notes, version number, status
(`VERIFIED / PENDING_VERIFICATION / OUTDATED / CONFLICTING_SOURCES / REQUIRES_LOCAL_COUNSEL / SUSPENDED / DEMO`).

**Immutability:** versions are never updated after publication; corrections create a new version with `supersedesVersionId`. The complete audit history of every change is therefore structural, not bolted on. Eligibility verdicts store the exact `ruleVersionIds` they used.

## 2. Shelf-life rule payloads (typed, in `src/domain/shelf-life/types.ts`)

```ts
type ShelfLifeRulePayload =
  | { kind: 'ABSOLUTE_MONTHS'; minMonths: number }                        // e.g. ≥ 6 months at arrival
  | { kind: 'PERCENTAGE_OF_ORIGINAL'; minPercent: number }               // e.g. ≥ 60% of original shelf life
  | { kind: 'COMBINED_RULE'; minMonths: number; minPercent: number;
      combinator: 'AND' | 'OR' | 'WHICHEVER_GREATER' }                   // e.g. 12 months OR 60%, whichever is greater
  | { kind: 'PRODUCT_SPECIFIC';
      rules: Array<{ match: ProductMatcher; rule: ShelfLifeRulePayload }>;
      fallback: ShelfLifeRulePayload }                                    // e.g. vaccines differ
  | { kind: 'CASE_BY_CASE'; note?: string }                              // regulator approval per case → human review
  | { kind: 'EXEMPTION_AVAILABLE'; base: ShelfLifeRulePayload;
      exemptionNote: string }                                             // base rule + documented exemption path
  | { kind: 'NO_VERIFIED_RULE' }                                          // explicitly: we do not know → human review
```

`ProductMatcher` matches on ATC prefix, dosage form, cold-chain flag, or controlled status. Evaluation semantics:
- Percentage rules require known original shelf life; otherwise → `INSUFFICIENT_DATA`.
- "N months remaining at arrival" is calendar arithmetic: `addMonths(arrivalDate, N) <= expiryDate`.
- `CASE_BY_CASE` and `NO_VERIFIED_RULE` always produce `HUMAN_REVIEW_REQUIRED`.
- `EXEMPTION_AVAILABLE`: base failure downgrades to `CONDITIONALLY_ELIGIBLE` with the exemption as a required condition — never silently eligible.

Other rule types (`PRODUCT_REGISTRATION`, `IMPORT_LICENSE`, `LABELING`, `SERIALIZATION`, `CONTROLLED`, `CUSTOMS`) use analogous typed payloads: requirement lists, required document codes, permitted languages, estimated clearance days.

## 3. Country regulatory record

Per country, the platform maintains (all nullable-until-verified, never guessed): medicines authority + website, import requirements, product registration requirements, importer licensing, shelf-life rule(s), exemptions (hospital/emergency/donation), language & labeling, serialization, temperature rules, controlled-drug rules, special permit process, customs documentation, estimated clearance time, required documents, sanctions considerations, payment restrictions, risk score, buffers (shipping/customs/operational) — plus `CountryReadinessScore` with visible components (regulatory clarity, shelf-life compatibility, partner availability, demand, payment risk, sanctions complexity, shipping infrastructure, customs predictability, processing time, commercial attractiveness), each with its own confidence.

## 4. Country research pipeline (admin workflow — 13 steps)

1. Identify official medicines authority → 2. record official sources (`RegulatorySource`) → 3. commercial import rules → 4. product registration rules → 5. importer licensing → 6. shelf-life requirements → 7. exceptions → 8. labeling → 9. serialization → 10. controlled products → 11. customs → 12. legal/compliance review → 13. **publish rule versions + set `tradeStatus = TRADE_ENABLED`** (PLATFORM_ADMIN, audit-logged).

Until step 13: the country stays `NOT_TRADE_ENABLED` — listings can be *evaluated* against it (result: HUMAN_REVIEW/INSUFFICIENT_DATA) but nothing is purchasable there.

## 5. Absolute rule

Uncertainty is captured, never converted into a production rule. Primary government/regulator sources preferred; every rule stores source + verification date; conflicting sources get status `CONFLICTING_SOURCES` and block auto-eligibility until resolved by a human.
