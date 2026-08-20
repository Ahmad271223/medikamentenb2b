# PART N — Testing Strategy

## Pyramid

1. **Unit (Vitest, majority)** — pure domain engines and libs: shelf-life math, every rule kind, eligibility aggregation, state machine, RBAC matrix, money/economics, password hashing. Deterministic, no DB. Run: `npm test`.
2. **Integration (Vitest + Postgres)** — services against a real Postgres (docker): onboarding→KYB→approval slice, license expiry blocking listing publication, document permission checks, audit immutability (UPDATE on audit_log must fail). Run in CI with a Postgres service container. (Scaffolded in M2.)
3. **API tests** — route handlers via `fetch` against dev server: input validation (zod rejects), authN (401), authZ (403 for wrong role/org), error envelope shape.
4. **E2E (Playwright, from M2)** — critical journeys: register→onboard→verify→upload batch→list→(M2) buyer sees/doesn't see listing→offer→compliance→(M4) settle.
5. **Security tests** — negative permission suite (every role × forbidden action), org-isolation probes (IDOR attempts), rate-limit behaviour, header presence.
6. **Regulatory-rule tests (first-class citizens)** — table-driven cases per rule kind and per verdict; golden tests pinning engine output shape (reason codes) so verdict changes are always intentional.
7. **Financial tests** — Decimal exactness (`0.1 + 0.2` class errors impossible), rounding policy (2dp, half-up documented), commission/landed-cost/payout invariants (`payout + commission = subtotal`).

## Canonical scenarios (required by spec §68 — all covered as unit tests in M1, integration in M2+)

| Scenario | Expected |
|---|---|
| Expired seller license | listing cannot transact (BLOCK reason `SELLER_LICENSE_EXPIRED`) |
| Recalled batch | transaction blocked instantly (`BATCH_RECALLED`) |
| Insufficient shelf life at projected arrival | destination blocked with calculation shown |
| Percentage rule, unknown original shelf life | `INSUFFICIENT_DATA`, never a guess |
| Unverified/DEMO country rule | `HUMAN_REVIEW_REQUIRED`, never `ELIGIBLE` |
| Missing import permit | conditional pre-trade, cannot ship |
| Sanctions BLOCKED | `INELIGIBLE` |
| Unauthorized user reads document | 403, audit entry |
| Buyer in non-eligible country | restricted listing hidden / no purchase control |
| Analyst tries to verify rule / release transaction | denied |
| Admin tries compliance-approve transaction | denied (separation of duties) |
| Financial decimals | exact to the cent, no float drift |
| Illegal state transition (e.g. OFFER_ACCEPTED → READY_FOR_PICKUP) | rejected |

## Conventions
- Tests colocated: `src/domain/**/x.test.ts`.
- Fixtures build *verified* synthetic inputs explicitly (test data may be "verified" because it asserts nothing about real countries).
- CI gate: typecheck + lint + unit + integration + build must pass before merge.
