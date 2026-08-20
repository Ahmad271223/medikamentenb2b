# PharmaBridge — working conventions

Regulated B2B pharma marketplace. Working name "PharmaBridge" is isolated in `src/lib/branding.ts` — never hardcode it elsewhere; UI copy lives in `messages/*.json`.

## Commands
- `npm run dev` · `npm run build` · `npm test` (Vitest) · `npm run typecheck` · `npm run lint`
- DB: `docker compose up -d` (Postgres 16, port **5547**) → `npm run db:migrate` → `npm run db:seed`
- Demo login: `*@demo.pharmabridge.local` / `PharmaBridge-Demo-2026` (see README table)

## Hard rules (do not violate)
1. **NO-HALLUCINATION POLICY:** never seed, hardcode, or display an unverified regulatory statement about a real country as fact. Unknown ⇒ `NO_VERIFIED_RULE` / `UNKNOWN` / "SOURCE REQUIRED". Demo data carries `isDemo` flags, `[DEMO]` prefixes, or rule status `DEMO`. The fictional country `ZZ` exists for full-flow demos — real countries only become tradable through the 13-step research pipeline (docs PART H).
2. **Uncertainty never upgrades.** The eligibility engine degrades missing/unverified inputs to `INSUFFICIENT_DATA` / `HUMAN_REVIEW_REQUIRED` — never to `ELIGIBLE`. Keep it that way in every extension.
3. **No floating point for money.** `decimal.js` / `Prisma.Decimal` only (`src/domain/economics`).
4. **No local-time date math in domain code.** Use `src/domain/dates.ts` (UTC-only) — date-fns caused a DST bug once already.
5. **`src/domain/**` stays pure:** no Prisma, no Next.js, no I/O imports. Snapshots in, verdicts out. Colocated `*.test.ts` must stay green.
6. **Every mutation is server-authorized:** route handlers call `requirePermission()` (`src/lib/api.ts`) against the matrix in `src/lib/authz/permissions.ts` (mirrors docs PART G, covered by tests). Frontend checks are cosmetic.
7. **Audit everything compliance-relevant** via `writeAudit()` inside the same transaction. `AuditLog` and `TransactionStateEvent` are append-only (DB trigger rejects UPDATE/DELETE — don't try).
8. **Regulatory rules are versioned, never overwritten:** changes create a new `RegulatoryRuleVersion` with `supersedesVersionId`; verification is a human act (Compliance Officer). Analyst drafts ≠ publishes.
9. **Separation of duties:** only `COMPLIANCE_OFFICER` holds `transaction:compliance-approve`; `PLATFORM_ADMIN` deliberately does not.
10. **Config over code:** fees, buffers, thresholds, excluded product classes → `PlatformConfig` (`src/lib/config/platform-config.ts`), never constants.

## Conventions
- API envelope: `{ ok: true, data } | { ok: false, error: { code, message, details? } }`; zod-parse every input; error messages are i18n code keys.
- i18n: locales `de` (default) → `en` → `ar` (RTL). Every user-facing string goes into all three catalogs in `messages/`. Use logical CSS utilities (`ms-/me-/ps-/pe-/text-start`) so RTL mirrors correctly.
- UI: server components query Prisma directly (reads); mutations go through `/api/v1` via the small client forms in `src/components/forms/`. Design system primitives in `src/components/ui/` (CVA-based, slate + `brand-*` petrol palette).
- Prisma 6 pinned (Prisma 7 has breaking generator changes — upgrade deliberately, not incidentally). Next pinned to 15.x; Next 16 upgrade is a scheduled task (also clears the `sharp` audit findings).
- Docs: `docs/architecture/A…O` mirror the founding spec parts. Keep PART C/G in sync when schema or permissions change.
