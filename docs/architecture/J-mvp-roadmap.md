# PART J — MVP Roadmap (executable milestones)

## M0 — Architecture (this delivery)
Docs A–O + API design + risk register, schema, RBAC design, state machines, sitemap. **Done.**

## M1 — Foundation ("first exact development milestone")
**Goal:** a licensed seller and a buyer can onboard, be verified, and manage verified master data; the core engines exist and are tested.

Scope & acceptance criteria:
- [x] Next.js 15 + TS strict + Tailwind scaffold, i18n de/en/ar with RTL
- [x] Full Prisma schema (all entities of PART C) + migrations on PostgreSQL 16
- [x] Session auth (register/login/logout), scrypt hashing, MFA-ready schema
- [x] RBAC policy engine + permission tests; all mutations server-checked
- [x] Organization onboarding (seller/buyer) → KYB compliance queue → officer approves (vertical slice)
- [x] License management with expiry warnings; expired/unverified licenses block regulated actions
- [x] Warehouses, product master (propose), batches with expiry buckets, inventory dashboard
- [x] Document vault (hash-verified upload, permissioned download)
- [x] Shelf-life engine + rule evaluation (all 7 rule kinds) — unit tested
- [x] Eligibility engine v1 (all check families, uncertainty degradation) — unit tested
- [x] Transaction state machine with guards — unit tested
- [x] Deal economics with Decimal arithmetic — unit tested
- [x] Append-only audit log (DB trigger) wired into auth/KYB/license/batch actions
- [x] Seed: clearly-labeled DEMO data incl. fictional country `ZZ` for the eligible-flow demo
- [x] `npm run build` green, `npm test` green

## M2 — Marketplace ✅ (delivered)
- [x] Listings full flow: create → per-country eligibility snapshots → auto-activation for the fully verified low-risk case (config `listing_auto_approve_verified`) or compliance review → ACTIVE; withdraw
- [x] Marketplace search + filters, **eligibility-filtered by the buyer's country** (`marketplace-service`, shared by API and page); listing detail with verdict, conditions, required docs/permits; anonymous-seller mode
- [x] BuyerDemand RFQs (master-data or free text — free text is matched by humans, never guessed)
- [x] Matching runs on listing activation and demand creation; scored via §54 weights with derived components (`domain/matching/derive`), Match rows + notifications both sides
- [x] Offer → reject/counter/accept chains; accept re-checks all guards, reserves inventory, computes exact Decimal economics, creates the transaction and routes it into mandatory COMPLIANCE_REVIEW
- [x] Transaction release computes the REAL guard context (licenses, sanctions, permit, verified documents) — an officer's click cannot override a missing CoA
- [x] Bulk CSV import: parse (comma/semicolon, quoted fields, BOM) → row-level validation report → dry-run preview → clean-file import (fixed documented headers; free column mapping later)
- [x] Mobile navigation; nav sections by org kind (buyer sees marketplace/demands, seller sees inventory/listings)
- [x] **Acceptance integration-tested** (`npm run test:integration`, 5 tests against Postgres): prohibited match blocked & explained (`DESTINATION_NOT_ELIGIBLE`); restricted listing invisible to wrong-country buyer; eligible buyer offers; seller counters; accept → COMPLIANCE_REVIEW with reservation + exact economics; release blocked without verified CoA, succeeds with it
Deferred within M2 scope: XLSX + column-mapping wizard (CSV shipped), invite-only/country-restricted visibility logic (enum in place, filter logic M3), demand→listing browsing UI for sellers beyond matches.

## M3 — Compliance operations ✅ (delivered)
- [x] Country-rule management UI: typed payload builder (all shelf-life kinds + import rule), analyst drafts → PENDING_VERIFICATION → officer/admin verifies & publishes; publishing supersedes via `supersedesVersionId` (old version → OUTDATED, never deleted) and **re-evaluates every open listing** (`reevaluateActiveListings`)
- [x] Country trade enablement gated on ≥1 verified shelf-life rule (research pipeline step 13); status changes re-evaluate listings
- [x] Country readiness scores: data-backed components only (regulatory clarity, trade status, registration coverage, demand activity, logistics config) each with note + confidence; unassessed dimensions listed explicitly as NOT ASSESSED — uncertainty never hidden
- [x] Recall cascade: batches → RECALLED, open listings → BLOCKED, non-terminal transactions → RECALL via the state machine with logged events, notifications to all affected orgs; case resolution never unlocks batches
- [x] Sanctions screening workflow (manual provider): result + validity recorded, org status updated, seller changes re-evaluate listings, fully audited
- [x] Admin configuration editor (fees, buffers, thresholds, excluded classes) — type-guarded against documented defaults, audited, cache-invalidated
- [x] Visibility modes: COUNTRY_RESTRICTED enforced in marketplace search, listing detail, offer guard and matching; INVITE_ONLY/PRIVATE never surface in search (invites arrive with the M4 deal room)
- [x] Audit viewer filters (entity type, action); value-scaled transaction review priority
- [x] **Acceptance integration-tested** (10 tests total across M2+M3): rule versions never overwritten (chain grows, verdicts flip INELIGIBLE and back on publish); unverified country cannot be enabled (`COUNTRY_RULES_NOT_VERIFIED`); recalled batch instantly untradable (listing BLOCKED, new listing refused); sanctions + config workflows verified
Deferred: sanctions list-provider API adapter, EUDRA-GMDP license cross-check workflow, RLS defense-in-depth (tracked for M6 hardening).

## M4 — Transactions ✅ (delivered — chat deferred by founder decision)
- [x] Transaction detail ("deal room light"): economics, required-document status vs. verified documents on file, per-role action panel, shipment section with milestones and temperature logs, payments/invoices/payout, full state timeline
- [x] Documents-required loop: officer requests documents (state + review → NEEDS_DOCUMENTS, both parties notified) → party resubmits → back to review; document verification action (`document:verify`) feeds the release guard
- [x] Payments abstraction (`src/lib/payments`): provider interface + explicitly-labeled **MANUAL_DEMO** provider (no real funds; licensed provider = founder decision #2); authorization → PAYMENT_AUTHORIZED with Payment record
- [x] Shipments: booking (auto-advance to READY_FOR_PICKUP), **dispatch re-checks the destination's CURRENT verified shelf-life rule against the actual ETA** — non-viable or unverifiable ⇒ blocked; milestones drive CUSTOMS/DELIVERED as SYSTEM transitions; temperature logs with exact excursion detection + batch flag + notifications
- [x] Settlement on buyer receipt confirmation: payment RELEASED, payout EXECUTED, BUYER_INVOICE + COMMISSION invoices (unique numbers), inventory booked reserved→sold, state SETTLED — one DB transaction, audited
- [x] **Acceptance integration-tested** (16 integration tests total): full §70 lifecycle OFFER_ACCEPTED→…→SETTLED as one scripted flow, incl. blocked dispatch on bad ETA, party guards (buyer cannot dispatch, seller cannot confirm receipt), and exact payout/invoice/inventory assertions
Deferred (founder: "erstmal ohne Chat"): deal-room chat + tasks, INVITE_ONLY invites, import-permit tracking UI (model + guard exist; permits verified via compliance), dispute resolution UI.

## M5 — Intelligence
Pricing references (licensed sources only), shortage signal ingestion (lawful feeds), recommendation engine, analytics dashboards (§46), economic value model surfaced per deal (§18).

## M6 — Enterprise
ERP integrations (SAP/Dynamics adapters), public API + API keys + webhooks, SSO (OIDC/SAML), advanced reporting, data residency options.

## Working method (every milestone)
architecture → requirements → data model → regulatory/security implications → implement → tests → run tests → fix → document → proceed.
