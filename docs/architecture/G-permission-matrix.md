# PART G — Permission Matrix (RBAC)

Two role dimensions, both enforced **server-side** on every mutation (`src/lib/authz/permissions.ts` is the executable source of truth; this table mirrors it and is covered by tests).

- **Platform roles** (User.platformRole): `PLATFORM_ADMIN`, `COMPLIANCE_OFFICER`, `REGULATORY_ANALYST`
- **Organization roles** (OrganizationMember.role): `OWNER`, `ADMIN`, `COMMERCIAL`, `INVENTORY`, `COMPLIANCE` (org-internal), `FINANCE`, `VIEWER`
- Logistics partners are organizations of kind `LOGISTICS` whose members see only shipment-scoped data (no pricing).

Legend: ✅ allowed · 🔒 allowed within own organization only · ✖ denied

| Permission | OWNER | ADMIN | COMMERCIAL | INVENTORY | COMPLIANCE (org) | FINANCE | VIEWER | PLATFORM_ADMIN | COMPLIANCE_OFFICER | REGULATORY_ANALYST |
|---|---|---|---|---|---|---|---|---|---|---|
| org:read | 🔒 | 🔒 | 🔒 | 🔒 | 🔒 | 🔒 | 🔒 | ✅ | ✅ | ✖ |
| org:update | 🔒 | 🔒 | ✖ | ✖ | ✖ | ✖ | ✖ | ✅ | ✖ | ✖ |
| member:manage | 🔒 | 🔒 | ✖ | ✖ | ✖ | ✖ | ✖ | ✅ | ✖ | ✖ |
| license:manage (upload/edit own) | 🔒 | 🔒 | ✖ | ✖ | 🔒 | ✖ | ✖ | ✅ | ✖ | ✖ |
| license:verify | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ✅ | ✅ | ✖ |
| warehouse:manage | 🔒 | 🔒 | ✖ | 🔒 | ✖ | ✖ | ✖ | ✅ | ✖ | ✖ |
| product:propose | 🔒 | 🔒 | 🔒 | 🔒 | ✖ | ✖ | ✖ | ✅ | ✖ | ✖ |
| product:verify | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ✅ | ✅ | ✖ |
| batch:manage | 🔒 | 🔒 | ✖ | 🔒 | ✖ | ✖ | ✖ | ✅ | ✖ | ✖ |
| listing:create/edit | 🔒 | 🔒 | 🔒 | ✖ | ✖ | ✖ | ✖ | ✅ | ✖ | ✖ |
| listing:publish | 🔒 | 🔒 | 🔒 | ✖ | ✖ | ✖ | ✖ | ✅ | ✖ | ✖ |
| listing:freeze | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ✅ | ✅ | ✖ |
| demand:manage (RFQ) | 🔒 | 🔒 | 🔒 | ✖ | ✖ | ✖ | ✖ | ✅ | ✖ | ✖ |
| offer:submit/respond | 🔒 | 🔒 | 🔒 | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ |
| offer:accept | 🔒 | 🔒 | 🔒 | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ |
| transaction:read | 🔒 | 🔒 | 🔒 | ✖ | 🔒 | 🔒 | 🔒 | ✅ | ✅ | ✖ |
| transaction:compliance-approve | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖* | ✅ | ✖ |
| document:upload | 🔒 | 🔒 | 🔒 | 🔒 | 🔒 | ✖ | ✖ | ✅ | ✖ | ✖ |
| document:read | 🔒 | 🔒 | 🔒 | 🔒 | 🔒 | 🔒 | 🔒 | ✅ | ✅ | ✖ |
| document:verify | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ✅ | ✅ | ✖ |
| payment:read | 🔒 | 🔒 | ✖ | ✖ | ✖ | 🔒 | ✖ | ✅ | ✖ | ✖ |
| shipment:read | 🔒 | 🔒 | 🔒 | 🔒 | ✖ | ✖ | 🔒 | ✅ | ✅ | ✖ |
| review:decide (KYB, listings, transactions) | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ✅ | ✅ | ✖ |
| rule:draft | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ✅ | ✅ | ✅ |
| rule:verify-publish | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ✅ | ✅ | ✖ |
| country:trade-enable | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ✅ | ✖ | ✖ |
| audit:read (own org) | 🔒 | 🔒 | ✖ | ✖ | 🔒 | ✖ | ✖ | ✅ | ✅ | ✖ |
| audit:read (platform-wide) | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ✅ | ✅ | ✖ |
| user:manage (platform) | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ✅ | ✖ | ✖ |
| config:manage (fees, buffers) | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ✅ | ✖ | ✖ |

\* Deliberate separation of duties: PLATFORM_ADMIN administers the platform but does **not** release transactions; that is the Compliance Officer's exclusive authority (an admin could grant themselves the role, but that grant is audit-logged).

**Key negative guarantees (tested):**
- REGULATORY_ANALYST can draft rules but can neither verify/publish them nor release transactions.
- VIEWER is strictly read-only.
- No org role can decide compliance reviews or verify licenses/rules.
- Logistics members never receive pricing/commercial fields.
- Buyers/sellers only act within their own organization (`🔒` = membership check + org scoping in every query).
