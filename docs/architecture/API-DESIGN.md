# API Design

## Conventions
- Base path `/api/v1`. JSON only. UTF-8. Times in ISO-8601 UTC. Money as string decimals + currency code.
- Envelope: success `{ "ok": true, "data": … }` · error `{ "ok": false, "error": { "code", "message", "details?" } }`.
- Error codes: `VALIDATION_ERROR` (400), `UNAUTHENTICATED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `CONFLICT` (409), `RATE_LIMITED` (429), `INTERNAL` (500). Messages are code-keyed for i18n.
- Every handler: (1) zod-parse input, (2) resolve session, (3) RBAC permission check with org scoping, (4) service call, (5) audit where relevant. No exceptions.
- Mutations validate the `Origin` header (CSRF defense alongside SameSite cookies).
- AuthN: session cookie (browser). Org-scoped API keys for ERP clients arrive in Phase 6 (`Authorization: Bearer`), same permission model.

## Endpoints (M1 — implemented)
| Method & path | Purpose | Permission |
|---|---|---|
| POST `/auth/register` | user + organization (DRAFT) | public (rate-limited) |
| POST `/auth/login` · POST `/auth/logout` | session lifecycle | public / authenticated |
| GET `/me` | current user + org + roles | authenticated |
| POST `/organizations/current/submit-kyb` | submit org for KYB review | org:update |
| POST `/licenses` · GET `/licenses` | manage own licenses | license:manage |
| POST `/warehouses` · GET `/warehouses` | warehouses | warehouse:manage |
| POST `/products` · GET `/products` | propose/list products | product:propose |
| POST `/batches` · GET `/batches` | batch inventory | batch:manage |
| POST `/documents` (multipart) · GET `/documents/:id/download` | vault upload/stream | document:upload/read |
| POST `/compliance/reviews/:id/decide` | approve/reject KYB & licenses | review:decide (platform) |
| GET `/health` | liveness/readiness | public |

## Endpoints (M2–M4 — specified)
Listings (`/listings`, `/listings/:id/publish`, `/listings/:id/eligibility`), marketplace search (`/marketplace/search` — always eligibility-filtered by caller's org country), demands (`/demands`), matches (`/matches`), offers (`/negotiations`, `/offers`, `/offers/:id/accept|reject|counter`), transactions (`/transactions/:id/transition` — guard-checked), shipments, payments (provider webhooks under `/webhooks/payments/:provider` with signature verification).

## Webhooks (outbound, Phase 4+)
Event types: `inventory.updated`, `offer.received`, `offer.accepted`, `transaction.state_changed`, `shipment.event`, `license.expiring`, `recall.issued`. Signed (HMAC-SHA256, per-endpoint secret), retried with backoff, delivery log persisted.

## Versioning
Additive changes within v1; breaking changes open `/api/v2` with overlap window. Response shapes are typed and exported for client generation.
