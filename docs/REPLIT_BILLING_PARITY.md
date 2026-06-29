# Replit Billing Parity — Reference & Gap Analysis

_Last updated: 2026-06-29 · Owner: billing/quota · Related: [REPLIT_PARITY_SPEC.md](./REPLIT_PARITY_SPEC.md), [REPLIT_PARITY_MATRIX.md](./REPLIT_PARITY_MATRIX.md), [BILLING.md](./BILLING.md)_

This document captures, in one place: (1) Replit's billing model with exact,
source-confirmed figures; (2) what VibeCore actually implements today; (3) the
gap analysis; (4) what was implemented to close gaps; and (5) live verification
paths on `app.e-code.ai`.

> **Headline:** VibeCore already ships a near-complete, Replit-parity credit
> billing system (plan catalog, effort-based checkpoint metering, credit packs,
> pay-as-you-go spend caps, compute/object-storage pricing) — built **dormant**
> behind the `BILLING_CREDITS_ENABLED` flag. The active billing path still uses
> the **legacy** flat plans ($29 Pro / $99 Team). This is a *flag flip + gap
> fill*, not a build-from-scratch.

---

## 1. Replit model (source-confirmed 2026-06-29)

### Plans

| Field | Starter | Core | Pro | Enterprise |
|---|---|---|---|---|
| Monthly | $0 | $25 | $100 | Custom |
| Annual (eff. /mo) | $0 | $20 (~20% off) | $95 (~5% off) | Annual commitment |
| Included credits | Free daily Agent credits | $25/mo | $100/mo | Per-contract |
| Seats | — | up to 5 | up to 15 (+50 viewers) | Unlimited |
| Parallel agent tasks | 1 | 1 | up to 10 | Per-contract |
| Credit rollover | none | none | 1 month | per-contract |
| DB rollback | 7 d | 7 d | 28 d | — |

Feature gates: Starter = Lite build + Design Canvas, 1 published app (expires
30 d); Core = unlimited workspaces/apps, badge removal; Pro = top models, Turbo
mode (Pro-only), 28-day rollback, premium support; Enterprise = SSO/SAML, VPC
peering, static egress IPs, single-tenant, admin governance.

### Effort-based AI metering

- **One checkpoint per request** is the billable unit (intermediate checkpoints
  removed to cut billing noise). Cost scales with effort; simple edits typically
  < $0.25, complex bundles more. No flat per-checkpoint price.
- **Modes:** Lite (cheap/targeted) · Economy (~⅓ of Power) · Power (baseline for
  complex) · **Turbo** (Pro/Enterprise only, ~2.5× faster, **2×–6× cost**; docs
  say ~2×, marketing says up to 6× — treat as a range, reserve at the ceiling).
- **High-Effort toggle** (Economy/Power): up to ~2× on the hardest tasks only.

### Credit packs

| Value | Price | Discount |
|---|---|---|
| $100 | $100 | — |
| $300 | $290 | $10 |
| $500 | $480 | $20 |
| $1,000 | $950 | $50 |

Expire **6 months** after purchase; consumed **earliest-expiry-first**; **no
rollover** past expiry. Plan monthly credits: Starter/Core no rollover, Pro
rolls over 1 month.

### Pay-as-you-go & spend controls

Usage-based fees apply **only after** monthly credits are exhausted. Individual
**Usage Limit** caps overage (Settings → Account → Billing); when hit,
usage-based services block until next cycle / raised limit. Org budgets set in
**$500 increments**. Categories: outbound data transfer, autoscale compute
units, requests.

### Deployment / compute units

- **1 CPU-s = 18 compute units**, **1 GB-s = 2 compute units**.
- Autoscale: $1.00/mo base + **$3.20 / M compute units** + **$1.20 / M requests**.
- Static: free hosting + $0.10/GB transfer. Scheduled: base + compute.
- Reserved VMs: $20 / $40 / $80 / $160 per month (0.5→4 vCPU).

### Object storage

$0.03/GiB-month · $0.10/GiB egress · **Class A (advanced/write) $0.0075/1k** ·
**Class B (basic/read) $0.0006/1k** · min 7-day retention per object.

### Database

Storage **floor 33 MB**, **cap 10 GiB** per production DB, **idle suspend 5 min**.

### Legal & policy

MIT auto-license on public apps; outcome-based enforcement (warning → community
ban → site/account ban, appeals@); free-account **inactivity 1 year**;
irreversible data deletion via Settings → Account; **20 concurrent apps** cap;
crypto-mining explicitly prohibited; abuse@ + DMCA + security@ channels.

---

## 2. What VibeCore implements today

| Capability | Where | Status |
|---|---|---|
| Credit plan catalog (Starter/Core $25/Pro $100/Ent), annual prices | `packages/billing/src/index.ts` `creditPlanCatalog` | ✅ exact |
| Plan credit grants + rollover (Pro=1mo) | `credits.ts` `planCreditConfig`, `creditRolloverMonths` | ✅ |
| Effort metering: build tiers (lite 0.4 / economy 1 / power 1.8) | `credits.ts` `BUILD_TIER_ESTIMATE_MULTIPLIER` | ✅ |
| Power controls: high-power, extended-thinking, turbo (additive, no 108× stack) | `credits.ts` `powerBoostSurcharge`, `estimateCheckpointCostCents` | ✅ |
| One checkpoint / request, open→gate→settle | `services/api/src/credits-service.ts`, `AgentCheckpoint` model | ✅ |
| Credit costing w/ margin (≥ raw provider cost) | `credits.ts` `computeCreditCostCents` (`DEFAULT_AI_MARGIN=0.3`) | ✅ |
| Credit packs: 6-mo expiry, earliest-first consumption | `credits.ts` `CREDIT_PACK_VALIDITY_DAYS`, `planPackConsumption` | ✅ |
| **Credit-pack purchase catalog (4 SKUs + discounts)** | `index.ts` `creditPackCatalog` | ✅ **added (this pass)** |
| PAYG gate + Usage Limit + Service Shutdown + 50/80/100% alerts | `credits.ts` `evaluateCreditGate`/`evaluateSpendLimits`/`paygAlertThresholdCrossed` | ✅ |
| Compute units (18/2), $3.20/M, $1.20/M, reserved VMs, egress | `compute-pricing.ts` | ✅ exact |
| Object storage $0.03 / $0.10 / 7-day | `compute-pricing.ts` | ✅ |
| **Object storage Class A/B op rates** | `compute-pricing.ts` | ✅ **fixed (was inverted)** |
| **DB floor 33 MB / cap 10 GiB / idle 5 min** | `compute-pricing.ts` | ✅ **added (this pass)** |
| **Concurrent published-app cap (20)** | `index.ts` `MAX_CONCURRENT_PUBLISHED_APPS` + `assertConcurrentPublishedApps` | ✅ **added (this pass)** |
| Stripe client (checkout/portal/metered usage report) | `index.ts` `StripeBillingClient` | ✅ (subscription) |
| Billing dashboard (plan, credits, packs, caps, checkpoints) | `app/routes/billing.tsx` | ✅ live |
| Usage dashboard (quota USED/LIMIT, overrides) | `app/routes/usage.tsx` | ✅ live |
| Public pricing page (4 plans, monthly/annual toggle) | `app/routes/pricing.tsx` → `ecode-exact/pages/Pricing.tsx` | ✅ live |
| Legal: terms, privacy, security, report-abuse, licensing, DPA, subprocessors, acceptable-use | `app/routes/*`, `ecode-exact/pages/*` | ✅ live |
| **Legal: enforcement, account-inactivity, data-deletion** | `app/routes/{enforcement,account-inactivity,data-deletion}.tsx` | ✅ **added (this pass)** |

Feature flags: `BILLING_CREDITS_ENABLED` (live charging; falsy ⇒ shadow:
log-only, never block/debit), `BILLING_CREDITS_SHADOW`, `MODEL_REGISTRY_DB`
(DB-driven AI pricing).

---

## 3. Gap analysis (Replit vs us)

| Area | Gap before | Resolution |
|---|---|---|
| Object-storage Class A/B | Rates **inverted** vs Replit/GCS (A↔B); write ops undercharged 12.5× | **Fixed** — A=$0.0075/1k (advanced/write), B=$0.0006/1k (basic/read) + test corrected |
| Credit packs | Consumption logic existed but **no purchase catalog** (SKUs/prices/discounts) | **Added** `creditPackCatalog` + `findCreditPack` + `creditPackDiscountCents` (tested) |
| Database guard-rails | No 33 MB floor / 10 GiB cap / 5 min idle constants | **Added** constants + `databaseBillableStorageGib()` (tested) |
| Concurrent apps | No 20-app cap | **Added** `MAX_CONCURRENT_PUBLISHED_APPS` + `assertConcurrentPublishedApps()` (tested) |
| Legal pages | Missing enforcement / account-inactivity / data-deletion | **Added** 3 pages + routes + Legal-hub wiring |
| Pack **purchase wiring** | Not purchasable (no checkout endpoint / webhook grant) | **Documented** (§5) — needs Stripe one-time price IDs + live verify (Avi) |
| Active plan model | Live checkout still legacy $29/$99 | **Flag-flip decision** (§5) — credit model is built & dormant |
| App-cap / DB-floor **enforcement** | Constants added; not yet wired to publish/DB-metering call sites | **Documented** (§5) — enforcement wiring pending |

---

## 4. Implemented this pass (gated, prod-safe, tested)

Branch `feat/billing-parity`. All changes are **pure billing primitives** or
**static legal content** — zero behaviour change to the active (legacy) billing
path; the credit model stays dormant behind `BILLING_CREDITS_ENABLED`.

- **`fix(billing)`** — corrected object-storage Class A/B op rates; added DB
  floor/cap/idle constants + `databaseBillableStorageGib`; added credit-pack SKU
  catalog + helpers; added concurrent-app cap + assert. 70 billing unit tests
  green, typecheck clean.
- **`feat(legal)`** — `/enforcement`, `/account-inactivity`, `/data-deletion`
  pages + shared `LegalArticle` layout; Legal hub now links these plus the
  existing acceptable-use and licensing pages. Web typecheck + eslint green.

Verification: `pnpm --filter @vibecore/billing test` (70 pass);
`tsc -p tsconfig.web.json --noEmit` (0 errors); `eslint app` (clean).

---

## 5. Remaining gaps (need Avi / not shippable blind)

1. **Credit-pack purchase flow.** The catalog + 6-month/earliest-first
   consumption are done. To make packs *purchasable* requires:
   - `StripeBillingClient.createCreditPackCheckoutSession({ priceId, mode: 'payment', metadata: { creditPackSku, organizationId } })` (new one-time-payment method alongside the subscription one at `index.ts:540`).
   - A gated endpoint `POST /orgs/:orgId/credits/packs/checkout` mirroring `/billing/checkout` (`app.ts:17333`).
   - **Webhook surgery (sensitive):** the `checkout.session.completed` branch (`app.ts:17645`) currently assumes *subscription* sessions — a `mode: 'payment'` session would fall through and **corrupt the subscription row**. Must add an early `if (object.mode === 'payment' && metadata.creditPackSku)` branch that calls `store.createCreditPack({ organizationId, purchasedCents, remainingCents, expiresAt: now + validityDays })` (persistence exists at `prisma-store.ts:3092`) and returns *before* the subscription logic.
   - **Blockers:** Avi must create the 4 Stripe one-time Prices and set
     `STRIPE_CREDIT_PACK_{100,300,500,1000}_PRICE_ID`; live verification needs a
     real Stripe round-trip. Not shipped blind per the production-quality bar.

2. **Flip the credit billing model live.** Set `BILLING_CREDITS_ENABLED=true`
   (and run the legacy→parity backfill `migrateLegacyPlanKey`: pro→core,
   team→pro, free→starter). This is a **business decision** affecting active
   billing — owner: Avi. Until then, live checkout remains legacy $29/$99.

3. **Enforcement wiring** for the new constants: call
   `assertConcurrentPublishedApps` at publish time and feed
   `databaseBillableStorageGib` into DB storage metering. Constants + helpers are
   ready; the call-site wiring is the remaining step.

---

## 6. Live verification paths (`app.e-code.ai`)

Public (no auth):

- `https://app.e-code.ai/pricing` — 4 plans (Starter/Core/Pro/Enterprise) + monthly/annual toggle.
- `https://app.e-code.ai/legal` — hub now lists Enforcement, Account Inactivity, Deleting Your Data, Acceptable Use, Licensing.
- `https://app.e-code.ai/enforcement` · `/account-inactivity` · `/data-deletion` — new policy pages render.

Authenticated (org member):

- `https://app.e-code.ai/billing` — plan, credits balance, pack balance, budget cap / spend limit bars, recent agent checkpoints.
- `https://app.e-code.ai/usage` — quota USED/LIMIT table, overrides.

Backend (unit-level, no live billing impact):

- `pnpm --filter @vibecore/billing test` — catalog/metering/pack/cap/storage math, 70 tests.

> Nothing in this pass changes live charging. "Parity" of the **economics and
> policy surface** is implemented & tested; **functional purchase of packs** and
> **flipping the credit model live** remain owner-gated (§5) and are not claimed
> as done.
