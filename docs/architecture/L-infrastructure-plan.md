# PART L — Environment & Infrastructure Plan

## Local development (working today)
- Windows/macOS/Linux, Node ≥ 22, Docker.
- `docker compose up -d` → PostgreSQL 16 on port **5547** (chosen to avoid collisions with other local projects).
- `npm run db:migrate` → migrations; `npm run db:seed` → DEMO data; `npm run dev` → app on :3000.
- Documents stored under `var/storage/` (git-ignored) via the local storage adapter.
- Secrets in `.env` (git-ignored); `.env.example` documents every variable; `src/lib/env.ts` validates at boot.

## Staging
- EU-region hosting (data-residency requirement). Recommended: containerized deploy (Docker image, Node 22-slim) on an EU provider (e.g. Hetzner/Scaleway/AWS eu-central-1) or Vercel + EU managed Postgres — final pick is PART O decision 8.
- Managed PostgreSQL with automated daily backups + PITR; separate DB per environment.
- S3-compatible object storage (EU bucket) via the storage adapter; server-side encryption.
- Seeded only with DEMO data; global DEMO banner on.

## Production
- Same container image as staging (build once, promote).
- TLS everywhere (managed certs), HSTS.
- Managed Postgres: encryption at rest, PITR, cross-region backup copies, restore drills quarterly.
- Object storage with versioning + lifecycle rules; access only via signed URLs from the app.
- Redis (managed) added in Phase 4 for queues/webhooks/rate limiting.
- Observability: structured JSON logs, error tracking (e.g. Sentry EU), uptime checks, DB metrics; audit log is business data, not telemetry.
- Disaster recovery targets (initial): RPO ≤ 24h (backups) improving to ≤ 15min (PITR), RTO ≤ 4h, documented runbook.

## CI/CD (GitHub Actions template — added with the remote repo)
1. install → typecheck → lint → unit tests
2. spin up Postgres service → migrations → integration tests
3. `next build`
4. dependency audit (`npm audit`, Dependabot/Renovate) + SAST-ready hook (CodeQL)
5. build Docker image → deploy to staging on `main`, manual promotion to production (tagged release)
6. Prisma migrations applied via release step (`prisma migrate deploy`), never auto in app boot.

## Environment configuration
`DATABASE_URL`, `SESSION_SECRET`, `STORAGE_DIR`/`S3_*`, `MAX_UPLOAD_MB`, `APP_URL`, `NODE_ENV` — validated by zod; the build fails fast on missing/invalid values. No secrets in code, no `NEXT_PUBLIC_` secrets ever.
