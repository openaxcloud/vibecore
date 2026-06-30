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
>
> **2026-06-29 follow-up pass:** the credit-pack **purchase flow** (one-time
> Stripe Checkout → webhook grant) and the **concurrent published-app cap** are
> now implemented end-to-end and unit-tested — both gated behind
> `BILLING_CREDITS_ENABLED` so prod is untouched until the model is flipped on.
> The only remaining work is owner-gated (Avi): create the 4 Stripe one-time
> Prices, set the env vars, and flip the flag. See §4/§5.

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
| **Credit-pack purchase catalog (4 SKUs + discounts)** | `index.ts` `creditPackCatalog` | ✅ **added (prior pass)** |
| **Credit-pack one-time Stripe checkout** | `index.ts` `StripeBillingClient.createCreditPackCheckoutSession` + `POST /orgs/:orgId/credits/packs/checkout` | ✅ **added (this pass, gated)** |
| **Credit-pack grant on `checkout.session.completed` (mode=payment)** | `services/api/src/app.ts` webhook early branch → `store.createCreditPack` | ✅ **added (this pass, gated)** |
| **Concurrent published-app cap enforced at publish** | `app.ts` publish handler → `assertConcurrentPublishedApps` + `store.countPublishedApps` | ✅ **added (this pass, gated)** |
| **Org budget $500-increment validation** | `credits.ts` `ORG_BUDGET_INCREMENT_CENTS`/`isValidOrgBudgetCents`/`roundOrgBudgetToIncrementCents` | ✅ **added (this pass)** |
| PAYG gate + Usage Limit + Service Shutdown + 50/80/100% alerts | `credits.ts` `evaluateCreditGate`/`evaluateSpendLimits`/`paygAlertThresholdCrossed` | ✅ |
| Compute units (18/2), $3.20/M, $1.20/M, reserved VMs, egress | `compute-pricing.ts` | ✅ exact |
| Object storage $0.03 / $0.10 / 7-day | `compute-pricing.ts` | ✅ |
| **Object storage Class A/B op rates** | `compute-pricing.ts` | ✅ **fixed (was inverted)** |
| **DB floor 33 MB / cap 10 GiB / idle 5 min** | `compute-pricing.ts` | ✅ **added (prior pass)** |
| **Concurrent published-app cap (20) constant + assert** | `index.ts` `MAX_CONCURRENT_PUBLISHED_APPS` + `assertConcurrentPublishedApps` | ✅ **added (prior pass)** |
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
| Pack **purchase wiring** | Not purchasable (no checkout endpoint / webhook grant) | **Implemented** (gated) — `createCreditPackCheckoutSession` + `POST /orgs/:orgId/credits/packs/checkout` + `mode='payment'` webhook branch that grants the pack and returns *before* the subscription path. Only the 4 Stripe Price IDs + flag flip remain (Avi). |
| App-cap **enforcement** | Constant added; not wired to a call site | **Implemented** (gated) — `countPublishedApps` + `assertConcurrentPublishedApps` called at publish, excluding the project being re-published so only a genuinely-new 21st app is blocked. |
| Org budget increments | No $500-increment rule | **Implemented** — `ORG_BUDGET_INCREMENT_CENTS` + validate/round helpers (tested). |
| Active plan model | Live checkout still legacy $29/$99 | **Flag-flip decision** (§5) — credit model is built & dormant. |
| DB-storage **metering** | Floor/cap primitive existed with **no consumer** | **Implemented** (gated) — `databaseStorageCents` + `meterDatabaseStorage` + daily `meterAllDatabaseStorage` sweep over `DatabaseInstance.sizeBytes` (33 MB floor / 10 GiB cap **per DB**) → `POST /internal/metering/database-storage` + worker cron `metering.databaseStorage` + helm CronJob. The primitive now has its consumer. |
| Usage PAYG + spend cap | Overage on compute/storage/DB metering was **lost** (not counted toward the cap, not billed) | **Implemented** (gated) — the metering charge path records the overage as a PAYG ledger entry, so `sumPaygSpendSince` → the `checkServiceShutdown` spend cap + 50/80/100% alerts now see **usage** overage (not just agent checkpoints), and reports it to Stripe via `reportUsagePaygUsage`. |

---

## 4. Implemented this pass (gated, prod-safe, tested)

All changes are **pure billing primitives**, **gated server logic** (dormant
behind `BILLING_CREDITS_ENABLED`), or **static legal content** — zero behaviour
change to the active (legacy) billing path.

**Prior pass** (`fix(billing)` / `feat(legal)`): corrected object-storage Class
A/B op rates; DB floor/cap/idle constants + `databaseBillableStorageGib`;
credit-pack SKU catalog + helpers; `MAX_CONCURRENT_PUBLISHED_APPS` constant +
assert; `/enforcement`, `/account-inactivity`, `/data-deletion` legal pages.

**This pass** — closing the §5 functional gaps (all real, all tested):

- **Credit-pack purchase flow (gated).**
  - `StripeBillingClient.createCreditPackCheckoutSession()` — one-time
    (`mode: 'payment'`) Checkout Session carrying `creditPackSku` in metadata
    (and on the PaymentIntent). Plus `createOneTimePrice()` for admin pack-price
    provisioning.
  - `POST /orgs/:orgId/credits/packs/checkout` — `billing:manage`-gated; 503s
    `CREDIT_PACKS_DISABLED` while the credit model is dormant, 400
    `CREDIT_PACK_UNKNOWN` for a bad SKU, 503 `CREDIT_PACK_PRICE_NOT_CONFIGURED`
    when the `STRIPE_CREDIT_PACK_*_PRICE_ID` env var is unset.
  - **Webhook grant (the sensitive part, done safely):** an early branch in the
    Stripe `checkout.session.completed` handler matches
    `mode === 'payment' && metadata.creditPackSku`, grants
    `store.createCreditPack({ purchasedCents: pack.creditCents, expiresAt: now + 182d, stripePaymentIntentId })`,
    audits it, and **returns before** the subscription-upsert path — so a
    payment-mode session can never corrupt the org's subscription row.
    Idempotency rides the existing committed webhook-dedup row.
- **Concurrent published-app cap (gated).** New `store.countPublishedApps(orgId,
  { excludeProjectId })` (counts distinct projects with a READY *production*
  deployment); the publish handler calls `assertConcurrentPublishedApps` before
  promoting, excluding the current project so re-publishing never trips its own
  cap — only a genuinely-new 21st app is blocked (429 `APP_LIMIT_EXCEEDED`).
  Gated behind `BILLING_CREDITS_ENABLED`.
- **Org budget $500 increments.** `ORG_BUDGET_INCREMENT_CENTS` +
  `isValidOrgBudgetCents` + `roundOrgBudgetToIncrementCents` primitives.
- **Acceptable-use** page gained a "Usage limits" section (20-app cap +
  no-compute-only/mining), matching Replit's anti-mining + app-cap policy.

Verification (all green): `pnpm --filter @vibecore/billing test` (**72** pass);
`services/api` vitest `credit-packs-billing.spec.ts` (**8** new tests: checkout
gating, webhook grant/unpaid, publish cap block/allow/dormant) + existing
`deployment-publish`/`credit-store`/`credits-service`/`api.spec` webhook tests;
full `pnpm typecheck` (exit 0); `pnpm lint` (0 errors).

---

## 5. Remaining gaps (owner-gated — Avi)

1. **Stripe one-time Prices + flag flip to make packs *purchasable* live.** The
   code path is complete and tested end-to-end against the test store. To go
   live Avi must: (a) create the 4 Stripe one-time Prices and set
   `STRIPE_CREDIT_PACK_{100,300,500,1000}_PRICE_ID` (the `createOneTimePrice`
   helper or an admin flow can mint them); (b) set `BILLING_CREDITS_ENABLED=true`;
   (c) do one real Stripe round-trip to confirm. Until (a)+(b), the endpoint
   intentionally 503s rather than charge for credits the app won't yet spend.

2. **Flip the credit billing model live.** `BILLING_CREDITS_ENABLED=true` (+ the
   legacy→parity backfill `migrateLegacyPlanKey`: pro→core, team→pro,
   free→starter). **Business decision** affecting active billing — owner: Avi.
   Until then live checkout remains legacy $29/$99 and the new cap/pack paths
   stay dormant. This same flag arms the published-app cap.

3. **DB-storage metering pipeline.** ✅ DONE (this pass) — `meterAllDatabaseStorage`
   daily sweep + `POST /internal/metering/database-storage` + worker/helm cron.
   Dormant until the flag flip; activates with it.

4. **DB-*compute* active-hours metering.** `meterDatabaseCompute` + the `database`
   internal-metering kind exist and are tested, but no emitter yet produces DB
   *active hours* (Replit bills DB compute by active, not wall, time — which needs
   idle-suspend/resume tracking we don't yet capture). Storage is metered; compute
   active-hours is the one remaining DB emitter. Low-value while DBs are few; lands
   with idle-state tracking.

---

## 6. Live verification paths (`app.e-code.ai`)

Public (no auth):

- `https://app.e-code.ai/pricing` — 4 plans (Starter $0 / Core $25→$20 annual / Pro $100→$95 annual / Enterprise custom) + functional monthly/annual toggle, annual-savings line, comparison table.
- `https://app.e-code.ai/legal` — hub lists Enforcement, Account Inactivity, Deleting Your Data, Acceptable Use, Licensing.
- `https://app.e-code.ai/enforcement` · `/account-inactivity` · `/data-deletion` — new policy pages render; `/acceptable-use` now states the 20-app cap + anti-mining.

Authenticated (org member):

- `https://app.e-code.ai/billing` — plan, credits balance, pack balance, budget cap / spend limit bars, recent agent checkpoints.
- `https://app.e-code.ai/usage` — quota USED/LIMIT table, overrides.

Backend (gated; no live billing impact until the flag is flipped):

- `pnpm --filter @vibecore/billing test` — catalog/metering/pack/cap/storage/budget math (72 tests).
- `services/api` `credit-packs-billing.spec.ts` — endpoint gating, webhook pack-grant, publish-cap (8 tests).
- With `BILLING_CREDITS_ENABLED=true` + a Stripe key: `POST /orgs/:orgId/credits/packs/checkout {packId:'pack-300',successUrl,cancelUrl}` returns a Stripe checkout URL; completing it fires the webhook that grants a $300 / 182-day pack visible at `/billing`.

> "Parity" of the **economics + policy surface** is implemented & tested, and the
> **pack purchase flow + published-app cap are now functionally complete** behind
> `BILLING_CREDITS_ENABLED`. What remains is **owner-gated** (Stripe Price IDs +
> the business decision to flip the flip) — not a code gap.
