# Top Technical & Regulatory Risks

| # | Risk | Impact | Mitigation |
|---|---|---|---|
| 1 | **Operating without required broker/wholesaler registration** (EU 2001/83/EC Art. 85b et al.) | Company-ending | PART O decision 1 — counsel before first real trade; software already assumes human compliance gate on every transaction |
| 2 | **Wrong regulatory data → illegal shipment** | Legal liability, patient safety | Versioned verified-only rules, uncertainty degradation to human review, arrival-date shelf-life math with buffers, re-check at booking, no-hallucination policy, disclaimers |
| 3 | **Counterfeit/diverted product enters the network** | Criminal exposure, trust collapse | KYB + license verification vs. authorities, proof-of-ownership evidence, batch documents + hashes, serialization adapter roadmap (EU FMD), recall cascade, suspicious-activity flags |
| 4 | **Sanctions/export-control breach** | Fines, banking loss | Screening (org/owners/bank/route) with expiring validity, conservative REVIEW defaults, route checks, audit trail |
| 5 | **Ethical dumping optics/reality** (short-dated stock pushed to weak markets) | Reputational, regulatory | Demand-driven matching (consumption feasibility §57), destination rules enforced, positioning per §72/§73 encoded in copy and product rules |
| 6 | Regulatory DB staleness | Silent wrongness | `lastVerifiedAt` + re-verification SLAs per confidence, OUTDATED status auto-degrades eligibility, verification queue |
| 7 | Payment/escrow licensing misstep | Regulatory action | Abstraction only; provider decision gated (PART O 2) |
| 8 | Cross-org data leak | Loss of enterprise trust, GDPR fines | Org scoping everywhere, negative permission tests, audit, RLS planned |
| 9 | Single-region/data-loss event | Downtime, record loss | Managed Postgres PITR, EU backups, restore drills, DR runbook |
| 10 | Complexity outruns team (40+ entities, 6 phases) | Delivery stall | Modular monolith, pure tested engines, phase gates with acceptance criteria, config-over-code |
| 11 | GDP custody ambiguity (who is responsible for storage/transport quality) | License risk | Incoterm clarity per deal, logistics model decision (PART O 3), GDP-certified partners only, temperature evidence attached to shipments |
| 12 | FX/precision errors in settlement | Financial disputes | Decimal-only math, FX rate frozen per transaction, invariant tests |
