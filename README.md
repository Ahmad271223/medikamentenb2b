# PharmaBridge <sub>(working title)</sub>

**The regulated marketplace for pharmaceutical surplus.**
Medikamente dorthin bewegen, wo sie gebraucht werden.

A B2B platform for the regulated international redistribution of pharmaceutical inventory: licensed European sellers, verified buyers worldwide, and a **regulatory matching engine** in between. Nothing trades without verified licenses, verified country rules, and human compliance approval.

> ⚠️ All seeded business data is **DEMO DATA** and clearly labeled as such. No regulatory statement about any real country is asserted. This software does not provide legal advice.

## Quick start (local development)

Requirements: Node ≥ 22, Docker, npm.

```bash
npm install
docker compose up -d          # PostgreSQL 16 on port 5547
npm run db:migrate            # apply migrations
npm run db:seed               # DEMO data (idempotent — skips if present)
npm run dev                   # http://localhost:3000
```

**Demo accounts** (password for all: `PharmaBridge-Demo-2026`):

| Account | Role |
|---|---|
| `admin@demo.pharmabridge.local` | Platform Admin |
| `compliance@demo.pharmabridge.local` | Compliance Officer (releases transactions, decides KYB) |
| `analyst@demo.pharmabridge.local` | Regulatory Analyst (drafts rules, cannot publish) |
| `seller@demo.pharmabridge.local` | Seller org (DE, verified, 8 batches) |
| `seller2@demo.pharmabridge.local` | Seller org (AT, KYB pending — visible in the compliance queue) |
| `buyer@demo.pharmabridge.local` | Buyer org (fictional country ZZ, verified) |

UI languages: **Deutsch** (default) → English → العربية (RTL). Switch in the header.

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | dev server (Turbopack) |
| `npm run build` / `npm start` | production build / serve |
| `npm test` | Vitest unit suite (domain engines, RBAC, money, crypto) |
| `npm run typecheck` · `npm run lint` | strict TS / ESLint |
| `npm run db:migrate` · `db:seed` · `db:studio` | Prisma workflows |

## Architecture

The full architecture pack lives in [`docs/architecture/`](docs/architecture/) — PART A–O per the founding specification, plus [`API-DESIGN.md`](docs/architecture/API-DESIGN.md) and [`RISKS.md`](docs/architecture/RISKS.md). Start with [PART A](docs/architecture/A-executive-architecture.md).

Core layout:

```
prisma/schema.prisma      data model (≈50 entities), PostgreSQL 16, append-only audit via DB trigger
src/domain/               PURE engines (no I/O): shelf-life, eligibility, matching, FastLane,
                          transaction state machine, deal economics — fully unit-tested
src/lib/                  auth (scrypt + DB sessions), RBAC matrix, audit writer, storage adapter,
                          platform config
src/app/api/v1/           REST route handlers — zod-validated, permission-checked, audited
src/app/[locale]/         de/en/ar UI — public site + portal (seller, compliance, admin)
messages/                 i18n catalogs
```

**Safety invariants** (tested): recalled batches are untradable · expired/unverified licenses block regulated actions · unverified or DEMO regulatory rules never produce automatic eligibility (they degrade to human review / insufficient data) · shelf-life decisions always use the projected **arrival** date with configurable buffers · only a Compliance Officer can release a transaction (the platform admin deliberately cannot) · the audit log rejects UPDATE/DELETE at the database level.

## Status

**M1 — Foundation, M2 — Marketplace, M3 — Compliance operations, M4 — Transaction execution, M5 — Intelligence: complete**, including the deal-room chat, platform analytics with reference-backed savings, sourced pricing/shortage data entry, buyer dashboard — plus hardening: **Next 16** (proxy convention, clears the sharp audit findings), GitHub Actions CI, and 3 Playwright E2E journeys.
M4 added: transaction detail with role-based actions, the documents-required loop with human document verification, a payments abstraction behind a provider interface (explicitly-labeled MANUAL_DEMO provider — no real funds; licensed provider = founder decision #2), shipments with customs milestones and temperature logs (exact excursion detection), **dispatch re-checks the destination's current verified shelf-life rule against the actual ETA**, and settlement on buyer confirmation (payment released, payout executed, invoices written, inventory booked reserved→sold).

Tests: `npm test` (114 unit) · `npm run test:integration` (16 acceptance tests against Postgres — M2+M3+M4 criteria, including the full §70 lifecycle to SETTLED).

Next: **M5 — Intelligence** (pricing references from licensed sources, shortage signals, analytics dashboards, economic value model per deal) or hardening (Next 16 upgrade, CI pipeline, deal-room chat). Roadmap: [PART J](docs/architecture/J-mvp-roadmap.md). Open founder decisions: [PART O](docs/architecture/O-open-decisions.md).

Known items: `npm audit` reports 3 high findings in `sharp` bundled by Next 15.5 — resolved by the scheduled Next 16 upgrade; no untrusted image processing is used yet. Production build and dev server share `.next/` — don't run `npm run build` while `npm run dev` is running (restart dev afterwards).
