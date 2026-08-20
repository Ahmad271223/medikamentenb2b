# PART K — Repository Structure

```
artztneimittelb2b/
├── docker-compose.yml            # local PostgreSQL 16 (port 5547)
├── .env / .env.example           # env config — secrets never committed
├── package.json                  # scripts: dev, build, test, db:*, seed
├── tsconfig.json                 # strict
├── vitest.config.ts
├── next.config.ts                # next-intl plugin + security headers
├── CLAUDE.md                     # working conventions for AI-assisted development
├── docs/
│   └── architecture/             # PART A–O + API-DESIGN + RISKS (this pack)
├── prisma/
│   ├── schema.prisma             # source of truth for the data model
│   ├── migrations/               # SQL migrations (incl. audit immutability trigger)
│   └── seed.ts                   # DEMO-labeled seed data
├── messages/                     # i18n catalogs
│   ├── de.json                   # default locale
│   ├── en.json
│   └── ar.json                   # RTL
├── public/
└── src/
    ├── middleware.ts             # locale routing + session cookie gate
    ├── i18n/                     # next-intl routing/request config
    ├── lib/                      # infrastructure (I/O allowed)
    │   ├── branding.ts           # single place holding the product name
    │   ├── env.ts                # zod-validated environment
    │   ├── db.ts                 # Prisma singleton
    │   ├── result.ts             # Result<T,E> helper
    │   ├── crypto/password.ts    # scrypt hash/verify
    │   ├── auth/                 # sessions, current-user, rate limiting
    │   ├── authz/                # RBAC matrix + guards (server-side)
    │   ├── audit/audit.ts        # append-only audit writer
    │   ├── storage/              # document storage adapter (local → S3)
    │   └── config/               # PlatformConfig accessor with defaults
    ├── domain/                   # PURE business logic — no I/O, no Prisma, no Next
    │   ├── shelf-life/           # calculations + rule evaluation
    │   ├── eligibility/          # evaluateBatchForDestination()
    │   ├── matching/             # match score
    │   ├── fastlane/             # FastLane classifier
    │   ├── economics/            # deal economics (Decimal)
    │   └── transactions/         # state machine + guards
    ├── server/                   # orchestration services (Prisma + domain + audit)
    ├── app/
    │   ├── [locale]/
    │   │   ├── (public)/         # landing, compliance, login, register
    │   │   └── app/              # authenticated portal (dashboard, inventory, …)
    │   └── api/v1/               # REST route handlers (zod + RBAC on every one)
    └── components/
        ├── ui/                   # design system primitives (button, card, badge, table…)
        └── …                     # app shell, nav, forms, domain widgets

tests: colocated *.test.ts next to domain/lib modules (Vitest).
```

Rules: `src/domain` never imports from `src/lib/db`, `next/*`, or `@prisma/client` (client types allowed nowhere in domain — plain interfaces only). `src/app` never contains business logic. Branding is only referenced via `branding.ts`.
