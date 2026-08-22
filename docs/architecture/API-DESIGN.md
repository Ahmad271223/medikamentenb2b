# API Design

## Conventions
- Base path `/api/v1`. JSON only. UTF-8. Times in ISO-8601 UTC. Money as string decimals + currency code.
- Envelope: success `{ "ok": true, "data": … }` · error `{ "ok": false, "error": { "code", "message", "details?" } }`.
- Error codes: `VALIDATION_ERROR` (400), `UNAUTHENTICATED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `CONFLICT` (409), `RATE_LIMITED` (429), `INTERNAL` (500). Messages are code-keyed for i18n.
- Every handler: (1) zod-parse input, (2) resolve session, (3) RBAC permission check with org scoping, (4) service call, (5) audit where relevant. No exceptions.
- Mutations validate the `Origin` header (CSRF defense alongside SameSite cookies).
- AuthN: session cookie (browser) **or** org-scoped API key (`Authorization: Bearer pbk_…`) — delivered: keys carry an org role (COMMERCIAL/INVENTORY/VIEWER), are hashed at rest, rate-limited per key, revocable in settings; the identical server-side permission matrix applies.

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
| POST `/admin/users` · POST `/admin/users/:id/platform-role` | create platform staff (one-time password, welcome reset mail) / change platform role — org members can never hold a platform role, admins cannot demote themselves | user:manage |
| POST `/countries/:id/scope` | platform scope: who may register as seller / buyer | country:trade-enable |

## Endpoints (M2–M4 — specified)
Listings (`/listings`, `/listings/:id/publish`, `/listings/:id/eligibility`), marketplace search (`/marketplace/search` — always eligibility-filtered by caller's org country), demands (`/demands`), matches (`/matches`), offers (`/negotiations`, `/offers`, `/offers/:id/accept|reject|counter`), transactions (`/transactions/:id/transition` — guard-checked), shipments, payments (provider webhooks under `/webhooks/payments/:provider` with signature verification).

## Webhooks (outbound — delivered)
Event types: `offer.received`, `offer.accepted`, `transaction.state_changed`, `shipment.event`, `recall.issued` (`inventory.updated`, `license.expiring` planned). Signed `X-PB-Signature: sha256=<HMAC-SHA256(secret, body)>`, per-endpoint secret shown once, inline delivery with one retry and a persistent delivery log (queue-backed delivery moves to BullMQ/Redis with scale, PART L). Managed in settings; endpoints revocable.

## Versioning
Additive changes within v1; breaking changes open `/api/v2` with overlap window. Response shapes are typed and exported for client generation.
