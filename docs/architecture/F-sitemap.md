# PART F — Complete Sitemap

Routes are locale-prefixed: `/{de|en|ar}/...` (de = default). Status: ✅ built in M1 · 🔜 M2–M4 · 🧭 later phase.

## Public
| Route | Screen | Status |
|---|---|---|
| `/` | Landing page | ✅ |
| `/how-it-works` | How it works | ✅ (section on landing + page) |
| `/sellers` | For sellers | ✅ (landing section) 🔜 dedicated page |
| `/buyers` | For buyers | ✅ (landing section) 🔜 dedicated page |
| `/compliance` | Compliance approach + disclaimer | ✅ |
| `/countries` | Country coverage | 🔜 M3 |
| `/contact` | Contact / request demo | ✅ (mailto CTA) 🔜 form |
| `/login`, `/register` | Auth | ✅ |

## Portal (authenticated, `/app/...`)
| Route | Screen | Roles | Status |
|---|---|---|---|
| `/app` | Dashboard (seller/buyer metrics, expiry buckets) | org members | ✅ |
| `/app/onboarding` | Org onboarding status + next steps | OWNER/ADMIN | ✅ |
| `/app/organization` | Organization profile | OWNER/ADMIN | ✅ |
| `/app/licenses` | License management + expiry warnings | OWNER/ADMIN/COMPLIANCE | ✅ |
| `/app/warehouses` | Warehouse management | ADMIN/INVENTORY | ✅ |
| `/app/products` | Product database (org view) + create | INVENTORY+ | ✅ |
| `/app/inventory` | Batch inventory + expiry visualization | INVENTORY+ | ✅ |
| `/app/inventory/new` | Add batch | INVENTORY+ | ✅ |
| `/app/inventory/bulk` | Bulk upload wizard (CSV; XLSX/column-mapping later) | INVENTORY+ | ✅ M2 |
| `/app/listings` | My listings + create (eligibility snapshots, auto/review activation) | COMMERCIAL+ | ✅ M2 |
| `/app/marketplace` | Search + filters (eligibility-filtered) | verified buyers | ✅ M2 |
| `/app/marketplace/[id]` | Listing detail: verdict, conditions, offer form | verified buyers | ✅ M2 |
| `/app/demands` | RFQs / demand requests | buyers | ✅ M2 |
| `/app/matches` | Matches / opportunity dashboard | both | ✅ M2 |
| `/app/offers` | Offers & negotiation chains (accept/reject/counter) | COMMERCIAL+ | ✅ M2 |
| `/app/transactions` | Transactions list | involved orgs | ✅ M2 |
| `/app/transactions/[id]` | Transaction detail: economics, required-docs status, role-based actions (docs loop, payment, shipment, receipt), shipment milestones, payments/invoices, timeline | involved orgs + platform | ✅ M4 (chat deferred by founder) |
| `/app/shipments` | Shipment list | involved + platform | ✅ M4 |
| `/app/documents` | Document vault | per permission | ✅ |
| `/app/shipments` | Shipment tracking | involved + logistics | 🔜 M4 |
| `/app/payments` | Payments | FINANCE | 🔜 M4 |
| `/app/notifications` | Notifications | all | ✅ |
| `/app/analytics` | Org analytics | OWNER/ADMIN | 🧭 M5 |
| `/app/settings` | Org members & roles | OWNER/ADMIN | ✅ (basic) |

## Compliance workspace (`/app/compliance/...`, platform staff)
| Route | Screen | Status |
|---|---|---|
| `/app/compliance` | Review queue (prioritized) | ✅ |
| `/app/compliance/organizations` | KYB reviews | ✅ (queue-driven) |
| `/app/compliance/rules` | Regulatory rule viewer + versions | ✅ |
| `/app/compliance/rules/manage` | Country-rule management (draft → verify → publish, payload builder) | ✅ M3 |
| `/app/compliance/countries` | Countries: trade enablement (gated), readiness scores with visible components | ✅ M3 |
| `/app/compliance/recalls` | Recall management (create → cascade, resolve) | ✅ M3 |
| `/app/compliance/sanctions` | Sanctions screening workflow (manual provider) | ✅ M3 |

## Admin (`/app/admin/...`, PLATFORM_ADMIN)
| Route | Screen | Status |
|---|---|---|
| `/app/admin` | Command center (pending KYB, expiring licenses, GMV…) | ✅ (core tiles) |
| `/app/admin/organizations` | Organization management | ✅ |
| `/app/admin/users` | User management | ✅ |
| `/app/admin/products` | Product master curation | ✅ (list) |
| `/app/admin/audit` | Audit log viewer (entity/action filters) | ✅ |
| `/app/admin/config` | Fees, buffers, thresholds, exclusion lists (typed editor, audited) | ✅ M3 |
