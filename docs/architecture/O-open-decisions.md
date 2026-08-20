# PART O — Open Decisions (founder input genuinely required)

Everything else has a documented technical default. These eight materially change the business or legal posture:

1. **Legal operating model & brokering registration.** Does the platform act as (a) pure marketplace/introducer, (b) **broker of medicinal products** (EU Directive 2001/83/EC Art. 85b requires broker registration with a national authority), or (c) principal trader holding its own Wholesale Distribution Authorization (WDA) and taking title? This decides liability, revenue recognition, GDP obligations, and several UI flows (who contracts with whom). → **Needs pharmaceutical counsel before first real transaction. My recommendation to evaluate first: (b) registered broker, evolving toward (c) in select corridors.**

2. **Payments partner & fund flow.** Escrow-like flows require a licensed provider (e.g. B2B payment/escrow specialists, banks with trust accounts). Options: platform-invoiced commission with direct seller↔buyer settlement (simplest, lowest risk) vs. provider-managed escrow. No proprietary escrow without licensing analysis. → Decide before M4.

3. **Logistics model.** Seller-arranged (platform records tracking) vs. platform-orchestrated freight via GDP-certified forwarders (margin opportunity, more liability). Affects Incoterm defaults and FastLane. → Decide before M4.

4. **First destination corridors.** Country verification is expensive (counsel + time). Which 2–3 destination markets get the 13-step research pipeline first? Drives sales focus and the regulatory research budget. → Decide before M3.

5. **Compliance staffing.** A named, qualified compliance officer (Responsible Person profile) is needed before real KYB approvals; the software assumes this role exists from day 1.

6. **Pricing data licensing.** Reference price databases are commercial (national price lists, IQVIA-class data). License one, or launch with "insufficient pricing data" + own transaction history? → M5 input.

7. **Brand name & domain.** "PharmaBridge" is a working name (isolated in `src/lib/branding.ts`); trademark/domain check pending. Tagline shortlist: "Move medicines where they are needed." / "The regulated marketplace for pharmaceutical surplus."

8. **Hosting provider & jurisdiction.** EU data residency is assumed; pick provider (Hetzner/Scaleway/AWS eu-central-1/Vercel+EU DB) once staging is needed. Cost vs. compliance-artifact tradeoffs documented in PART L.

**Technical defaults already taken (no input needed, documented):** Arabic UI uses Modern Standard Arabic register (an `ar-LB` variant can be layered later); marketplace launch currency EUR with CHF/USD/GBP support in the model; commission default 5% seeded as *config*; short-dated threshold 12 months as *config*; MVP excludes controlled/cold-chain/biologics via *config*.
