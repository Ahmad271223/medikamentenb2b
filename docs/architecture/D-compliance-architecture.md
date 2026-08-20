# PART D — Compliance Architecture

**The single most important design question: where does automatic logic stop and human approval begin?**

## 1. Automation boundary

| Step | Automated? | Human gate |
|---|---|---|
| Data validation (formats, dates, completeness) | ✅ fully | — |
| Shelf-life calculation & projection | ✅ fully (deterministic math) | — |
| Applying a **verified** rule to computed facts | ✅ produces a *verdict proposal* | — |
| License expiry blocking | ✅ fully (hard block) | Re-verification by compliance after renewal upload |
| Recall/quarantine trade blocking | ✅ fully (hard block) | Compliance manages the recall case |
| Sanctions screening | ✅ produces CLEAR/REVIEW/BLOCKED | Every REVIEW → human; BLOCKED cannot be overridden below Platform Admin + documented reason |
| KYB / license verification | ❌ | **Compliance Officer approves each org and each license** |
| Country trade enablement | ❌ | **Admin + Compliance publish after the 13-step research pipeline (PART H)** |
| Regulatory rule verification | ❌ | Analyst drafts → **Compliance Officer/Admin verifies & publishes version** |
| Marketplace visibility | ✅ *only from verified inputs* | Unverified inputs degrade to HUMAN_REVIEW — never to visible/eligible |
| **Transaction release** | ❌ | **Every transaction passes COMPLIANCE_REVIEW; only a platform Compliance Officer can transition to READY_FOR_PAYMENT** |
| AI assistance (extraction, summaries) | ✅ drafts only | Always labeled "AI generated · requires human verification"; AI can never verify a rule, approve a license, or release a transaction |

**Degradation rule (encoded in the engine):** `unknown ⇒ never eligible`. Missing registration status ⇒ `INSUFFICIENT_DATA`/`HUMAN_REVIEW_REQUIRED`. Rule version status ≠ VERIFIED (including DEMO, PENDING_VERIFICATION, OUTDATED, CONFLICTING_SOURCES) ⇒ at best `HUMAN_REVIEW_REQUIRED`.

## 2. Rule verification lifecycle

```
DRAFT (Regulatory Analyst)
  → PENDING_VERIFICATION
  → VERIFIED (Compliance Officer / Admin — records verifier + date + source)
  → later: OUTDATED / CONFLICTING_SOURCES / SUSPENDED / superseded by new version
```

Every rule version stores: jurisdiction, rule type, payload, official source name + URL, authority, publication date, effective date, last verified date, verifier, confidence, notes, version number, status. Changes never overwrite — `supersedesVersionId` chains the history. The engine records **which rule version IDs** produced each verdict.

## 3. Compliance review queue

Work items (`ComplianceReview`) are created automatically for: new org KYB, new/renewed license, product proposals, listings pending publication, every transaction at `COMPLIANCE_REVIEW`, country rule publications.

Priority score = f(transaction value, product risk class, destination risk, remaining shelf life, sanctions flags, missing permits, first-time buyer/seller). Reviews record decision, reason, checklist, and are immutable once decided (corrections = new review, old one stays).

## 4. No-hallucination policy (operationalized)

- UI renders `UNKNOWN` / "Verifizierung erforderlich" / "SOURCE REQUIRED" states explicitly — never blank-optimistic defaults.
- Seed/demo data: `isDemo` flags + rule status `DEMO` + `[DEMO]` name prefixes + global demo banner. The engine treats DEMO rules as unverified (except the fictional demonstration country `ZZ`, which exists precisely to show the full eligible flow without asserting anything about a real country).
- Pricing without a sourced reference renders "insufficient pricing data".
- No regulatory claim is ever displayed as legal advice; a standing disclaimer accompanies regulatory views.

## 5. Auditability

- `AuditLog` is append-only (Postgres trigger blocks UPDATE/DELETE — migration `audit_log_immutable`).
- All state transitions, verifications, decisions, permission-relevant mutations write audit entries: who, what, when, org, old/new value, reason, session metadata.
- Admins cannot silently alter historical compliance records: decided reviews, rule versions, transaction state events, and audit rows are immutable by construction.
