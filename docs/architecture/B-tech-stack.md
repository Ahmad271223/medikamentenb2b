# PART B — Recommended Technical Stack

## Decisions and rationale

| Layer | Choice | Why |
|---|---|---|
| Framework | **Next.js 15 (App Router) + React 19 + TypeScript (strict)** | One deployable for public site, portals, and API in MVP; server components keep sensitive data server-side; mature ecosystem; pinned to 15.x for stability (16 upgrade is a scheduled task, see PART O). |
| Styling | **Tailwind CSS v4** + hand-rolled shadcn-style component library (`src/components/ui`) | Premium enterprise look with full control; CVA-based variants; no heavyweight UI dependency; accessible primitives. |
| i18n | **next-intl** — locales `de` (default) → `en` → `ar` | Founder requirement: German first, then English, then Arabic. `ar` renders RTL (`dir="rtl"`). UI copy uses Modern Standard Arabic for professional register (Lebanese Arabic is primarily spoken; an `ar-LB` variant can be layered later — documented assumption). Legal/official texts are stored in original language, translations labeled. |
| ORM / DB | **Prisma 6 + PostgreSQL 16** | Postgres per requirements (UUIDs, enums, JSONB for versioned rule payloads, transactional integrity). Prisma gives typed client + explicit migrations. Decimal columns for all money. |
| Validation | **zod** on every API input + typed env validation | "Validate all API inputs" — one schema per endpoint, shared with forms. |
| Money | **decimal.js** (and `Prisma.Decimal`) | Never floating point for financial calculations. |
| Dates | **date-fns** | Calendar-correct month arithmetic for shelf-life rules ("6 months remaining" is a calendar comparison, not `days/30`). |
| Auth | **Own session layer** (DB-backed opaque tokens, SHA-256-hashed at rest, httpOnly/SameSite cookies) + scrypt password hashing (node:crypto, OWASP-parameterized) | Compliance platforms need full ownership of session lifecycle, audit hooks, and MFA/SSO extension points. Schema is MFA-ready (TOTP fields) and SSO-ready (identity-provider table can be added without model changes). Argon2id is the documented production upgrade. No third-party auth lock-in. |
| Background jobs | Script-based in MVP (`npm run jobs:*`), **BullMQ + Redis** from Phase 4 | No premature infrastructure; Redis appears when queues/webhooks demand it. |
| Documents | Storage adapter interface: **local disk (dev)** → S3-compatible object storage (staging/prod) with signed URLs | Never public; access is permission-checked and streamed/signed. |
| Tests | **Vitest** (unit/integration), Playwright planned for E2E (Phase 2+) | Domain engines are pure functions — fast deterministic tests. |
| Infra | **Docker** (Postgres locally via `docker-compose.yml`), CI/CD via GitHub Actions template, EU-region hosting | See PART L. |

## Architecture style

**Modular monolith now, services later.** Strict layering:

```
UI (app router pages/components)
  → API (route handlers, zod, RBAC guard)      src/app/api/v1
    → Services (orchestration, Prisma, audit)   src/server
      → Domain engines (pure, no I/O)           src/domain
      → Data (Prisma client)                    src/lib/db.ts
      → Adapters (storage, email, sanctions…)   src/lib/*
```

Rules:
- `src/domain/**` imports **nothing** from Prisma, Next.js, or Node APIs beyond stdlib types → unit-testable, extractable.
- No business logic in components. No duplicated business logic — one engine, called everywhere.
- Server components may read via Prisma directly (read-only); **all mutations go through validated API routes** with server-side permission checks.

## API architecture (summary — full spec in `API-DESIGN.md`)

- REST under `/api/v1/*`, JSON, consistent envelope `{ ok, data } | { ok:false, error:{ code, message, details } }`.
- AuthN via session cookie (browser) — API keys per organization planned for ERP integrations (Phase 6).
- Webhooks (Phase 4+): inventory changes, offers, transactions, shipment events, license expiry, recall.
- Versioned from day one (`/v1`), additive changes preferred, breaking changes → `/v2`.

## Version pins (2026-08)

Next.js 15.x · React 19 · Prisma 6.x · Tailwind 4 · next-intl 4 · zod 4 · Node 24 (dev machine), Node 22 LTS in CI/prod containers.
