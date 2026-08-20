# PART M — Security Threat Model & GDPR

Assets: regulated trade records, licenses & KYB documents, commercial pricing, personal data of org contacts, regulatory database integrity, platform funds flow metadata.

## Threats & mitigations

| # | Threat | Vector | Mitigation (status) |
|---|---|---|---|
| 1 | Account takeover | credential stuffing, weak passwords | scrypt (OWASP params), 12+ char policy, login rate limiting, sessions revocable server-side, MFA-ready (TOTP fields), audit of logins ✅ · MFA enforcement UI (M2) |
| 2 | Cross-org data leakage | IDOR, missing scoping | every query org-scoped; RBAC guard on every mutation; permission tests incl. negative cases ✅; row-level security as defense-in-depth (M3) |
| 3 | Fake licenses / counterfeit sellers | forged uploads | human license verification against issuing authority, document hashing, sanctions screening, trust metrics; EUDRA-GMDP/registry cross-check workflow (M3) |
| 4 | Regulatory DB tampering | malicious/compromised admin | versioned immutable rules, verification separation of duties (analyst ≠ verifier), append-only audit with DB trigger, no silent edits ✅ |
| 5 | Transaction released without compliance | privilege abuse, API bypass | state machine guard: only COMPLIANCE_OFFICER actor can approve; server-side enforcement; audit ✅ |
| 6 | Document vault exposure | public URLs, path traversal | no public storage; permission-checked streaming/signed URLs; storage keys are UUIDs; MIME/size allow-list; hashes verify integrity ✅ |
| 7 | Injection (SQLi/XSS/CSRF) | user input | Prisma parameterized queries; React escaping + no `dangerouslySetInnerHTML`; zod validation on all inputs; SameSite=Lax cookies + Origin check on mutations; security headers (nosniff, frame-deny, referrer-policy) ✅ · CSP tightening (M2) |
| 8 | Secrets leakage | committed env, client bundles | `.env` git-ignored, zod env split server/client, no `NEXT_PUBLIC_` secrets, secret manager in prod ✅ |
| 9 | Sanctions evasion | shell buyers, rerouting | KYB + beneficial owners captured, sanctions checks on org/owners/bank/route with expiry, REVIEW/BLOCKED gates, conservative default (stale check ⇒ re-review) ✅ (manual provider) · list-provider API (M3) |
| 10 | Payment fraud | fake settlement claims | payments only via provider abstraction with signed webhooks (M4); no proprietary escrow without licensing analysis (PART O) |
| 11 | Temperature/quality fraud | forged records | temperature logs tied to shipments, excursion status on batch, quality verification workflow, recall cascade ✅ (data model) · IoT/logger integrations (M4+) |
| 12 | DoS / scraping of commercial data | bots | rate limiting (in-memory now, Redis M4), auth-gated marketplace, no public pricing endpoints ✅ |
| 13 | Supply-chain (npm) attacks | dependencies | lockfile, `npm audit` in CI, Renovate, minimal dependency surface ✅ |
| 14 | Backup/DR failure | data loss | managed Postgres PITR + restore drills (PART L) |

## GDPR architecture

- **Data minimization:** only business-contact personal data; no consumer/patient data at all (B2B only, no direct-to-patient).
- **Purpose limitation & records:** processing purposes documented per data class; processor agreements tracked (PART O).
- **Retention split (critical):** user-profile deletion/anonymization on request **without** touching legally-retained pharmaceutical transaction records (batch docs, compliance decisions, audit) — retention exceptions are explicit in the schema (see PART C §4).
- **Access & deletion requests:** admin workflow exports/anonymizes per user; every fulfilment audit-logged (privacy log).
- **Consent records** where needed (marketing contact), not for contractual necessity.
- **Storage:** EU-region hosting and backups; encryption in transit (TLS) and at rest (managed DB/storage).
