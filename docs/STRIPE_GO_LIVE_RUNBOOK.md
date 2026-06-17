# Stripe Go-Live Runbook — VibeCore (Replit-parity billing)

> **Audience:** Avi (account owner). **Goal:** turn on real billing with zero guesswork.
> Copy-paste exact. Do the Stripe-Dashboard steps yourself (payment credentials are owner-only);
> hand me the IDs from **§5** and I do all the config + deploy + activation.
>
> **Today:** billing runs in **SHADOW** (`BILLING_CREDITS_SHADOW=true`) — the engine computes and
> records every checkpoint cost but **never debits**. Nothing here charges a customer until **§6**.
> Every value below matches the code (`packages/billing/src/index.ts` `creditPlanCatalog`,
> `services/api/src/app.ts` `seedBillingPlans`, webhook handler).

---

## 0. Prerequisites (once)
- Log in to the **Stripe Dashboard** as the account owner.
- Confirm you are in **LIVE mode** (toggle, top-right — NOT "Test mode") for every step below.
- Currency: **USD**.

---

## 1. Create Products + Prices

Stripe Dashboard → **Product catalog** → **+ Add product**. Create these **4 products**. For each,
after saving, click into it and **copy the Price ID** (`price_…`) and the **Product ID** (`prod_…`).

### 1.1 Product "VibeCore Core"
- Name: `VibeCore Core`
- Add **two** recurring prices to this same product (click **+ Add another price**):
  | Price | Amount | Billing period | Notes |
  |---|---|---|---|
  | Core Monthly | **$25.00 USD** | Monthly | recurring |
  | Core Annual | **$240.00 USD** | Yearly | recurring (= $20/mo effective, ~20% off) |
- Copy: **Product ID**, **Core Monthly price ID**, **Core Annual price ID**.

### 1.2 Product "VibeCore Pro"
- Name: `VibeCore Pro`
- Two recurring prices:
  | Price | Amount | Billing period | Notes |
  |---|---|---|---|
  | Pro Monthly | **$100.00 USD** | Monthly | recurring |
  | Pro Annual | **$1140.00 USD** | Yearly | recurring (= $95/mo effective, ~5% off) |
- Copy: **Product ID**, **Pro Monthly price ID**, **Pro Annual price ID**.

### 1.3 Product "VibeCore PAYG — AI usage" (metered)
- Name: `VibeCore PAYG AI`
- Add **one** price, **usage-based (metered)**:
  - Pricing model: **Usage-based**
  - Click **More pricing options** → set **Usage type = Metered**, **Aggregation = Sum of usage values**
  - Price: a per-unit amount in USD (the code reports usage in **cents** as the unit quantity, so set
    the unit price to **$0.01** per unit → 1 unit = 1¢ of overage; this keeps the metered amount equal
    to the computed overage). Billing period: **Monthly**.
- Copy: **Product ID**, **PAYG-AI price ID**.

### 1.4 Product "VibeCore PAYG — Compute" (metered)
- Name: `VibeCore PAYG Compute`
- Same as 1.3 (Usage-based / Metered / Sum), **$0.01 per unit**, Monthly.
- Copy: **Product ID**, **PAYG-Compute price ID**.

> **Starter** and **Enterprise**: do **NOT** create self-serve prices. Starter is free (no checkout);
> Enterprise routes to `/contact-sales`. The code short-circuits both.

### How to create a metered price (detail)
On the product page → **+ Add another price** → **Usage-based** → expand **More pricing options** →
**Usage type: Metered** → **Charge for metered usage by: Sum of usage values during period** →
enter the per-unit price (**$0.01**) → **Billing period: Monthly** → **Add price** → copy the `price_…`.

---

## 2. Webhook endpoint

Stripe Dashboard → **Developers → Webhooks → + Add endpoint**.

- **Endpoint URL (exact):**
  ```
  https://app.e-code.ai/billing/stripe/webhook
  ```
- **API version:** use the account default (latest).
- **Events to send** — select exactly these (these are the events the handler processes today,
  `services/api/src/app.ts` webhook):
  ```
  checkout.session.completed
  customer.subscription.created
  customer.subscription.updated
  customer.subscription.deleted
  invoice.paid
  invoice.payment_failed
  ```
  *(Optional, for future proactive dunning/alerts — safe to add now, currently ignored:
  `invoice.created`, `invoice.upcoming`, `invoice.finalized`.)*
- **Add endpoint** → click into it → **Signing secret** → **Reveal** → copy the **`whsec_…`** value.

---

## 3. Generate / rotate the LIVE secret key

Stripe Dashboard → **Developers → API keys** (LIVE mode).
- Use the **Secret key** (`sk_live_…`). If rotating: **Roll key** → copy the new `sk_live_…`.
- Treat this as a secret — send it to me via the secure channel we use for secrets, **not** in chat.

---

## 4. EXACT config key names (what I fill — for your reference)

I place the IDs from §5 into the Helm config. Because CD runs `helm upgrade --reuse-values` (which
ignores newly-added values keys), these go in as **hardcoded literals** in
`infra/helm/platform/templates/configmap.yaml` (same pattern as `BILLING_CREDITS_SHADOW`):

```
# configmap literals (non-secret — product/price IDs are not secrets)
STRIPE_CORE_PRODUCT_ID:        prod_…   (from 1.1)
STRIPE_CORE_PRICE_MONTHLY_ID:  price_…  (Core Monthly,  1.1)
STRIPE_CORE_PRICE_ANNUAL_ID:   price_…  (Core Annual,   1.1)
STRIPE_PRO_PRODUCT_ID:         prod_…   (from 1.2)
STRIPE_PRO_PRICE_MONTHLY_ID:   price_…  (Pro Monthly,   1.2)
STRIPE_PRO_PRICE_ANNUAL_ID:    price_…  (Pro Annual,    1.2)
STRIPE_PAYG_AI_PRICE_ID:       price_…  (PAYG-AI,       1.3)
STRIPE_PAYG_COMPUTE_PRICE_ID:  price_…  (PAYG-Compute,  1.4)
AI_MARGIN:                     "0.30"   (internal margin; already default 0.3)
```

```
# secrets (GCP Secret Manager — already mapped in values-prod.yaml secretManagerMap)
STRIPE_SECRET_KEY      -> secret: vibecore-prod-stripe-secret-key      (the sk_live_… from §3)
STRIPE_WEBHOOK_SECRET  -> secret: vibecore-prod-stripe-webhook-secret  (the whsec_… from §2)
```

*Convention (code, `seedBillingPlans`):* `STRIPE_<PLANKEY>_PRICE_MONTHLY_ID` / `_ANNUAL_ID` where
`<PLANKEY>` ∈ `CORE`,`PRO`. Legacy `STRIPE_<KEY>_PRICE_ID` stays the monthly fallback.

---

## 5. What to send me

Reply with these **8 IDs** (non-secret — fine to paste in chat):
```
STRIPE_CORE_PRODUCT_ID        = prod_____
STRIPE_CORE_PRICE_MONTHLY_ID  = price_____
STRIPE_CORE_PRICE_ANNUAL_ID   = price_____
STRIPE_PRO_PRODUCT_ID         = prod_____
STRIPE_PRO_PRICE_MONTHLY_ID   = price_____
STRIPE_PRO_PRICE_ANNUAL_ID    = price_____
STRIPE_PAYG_AI_PRICE_ID       = price_____
STRIPE_PAYG_COMPUTE_PRICE_ID  = price_____
```
And **separately/securely**: the `sk_live_…` (§3) and `whsec_…` (§2) so I can put them in Secret Manager.

---

## 6. Activation sequence (I run this)

1. **Config:** paste the 8 IDs as configmap literals (§4) + load `sk_live_…` / `whsec_…` into
   `vibecore-prod-stripe-secret-key` / `vibecore-prod-stripe-webhook-secret`.
2. **Deploy:** push to `main` → CD `helm upgrade` rolls api+web. (No `--reuse-values` surprise because
   the IDs are literals.)
3. **Verify seed:** `GET /admin/billing` / Admin → Stripe health shows the plans seeded with the
   product/price IDs and **Stripe key = LIVE, connectivity OK**.
4. **Backfill subscriptions (one-time):** run the P7 backfill that renames existing subs
   `pro`→`core`, `team`→`pro`, `free`→`starter` (`migrateLegacyPlanKey`) so live customers map to the
   new catalog.
5. **Validate in SHADOW (already on):** run a few real agent requests; confirm `AgentCheckpoint`
   costs match `AiCostLedger` and the wallet is **not** debited. (This is the safety gate.)
6. **Go live — canary:** flip `BILLING_CREDITS_ENABLED=true` (this turns SHADOW off and starts real
   debits) for a **single canary org** first (via a per-org override), watch the wallet + Stripe
   metered usage for one cycle.
7. **Go live — global:** set `BILLING_CREDITS_ENABLED=true` platform-wide. Real charges begin.
8. **PAYG:** with the metered prices wired, overage beyond included credits reports to Stripe
   (`reportUsage`, idempotent) against the PAYG price IDs.

**Rollback at any step:** set `BILLING_CREDITS_ENABLED` back to unset/`false` → returns to SHADOW
(compute-only, no debit). Price/secret changes are config-reversible.

---

## 7. Quick reference — amounts (must match Stripe exactly)

| Plan | Monthly | Annual (billed once) | Effective /mo | Included credits |
|---|--:|--:|--:|--|
| Starter | $0 | — | — | Free **daily** Agent credits (25¢/day, no rollover) |
| **Core** | **$25.00** | **$240.00** | $20.00 | **$25/mo**, rollover 1 month |
| **Pro** | **$100.00** | **$1140.00** | $95.00 | **$100/mo**, rollover 1 month |
| Enterprise | custom | custom | — | custom (contact sales) |
| PAYG AI | metered | — | — | $0.01/unit (1 unit = 1¢ overage), Sum, Monthly |
| PAYG Compute | metered | — | — | $0.01/unit, Sum, Monthly |

*Generated 2026-06-17. Source of truth: `packages/billing/src/index.ts` `creditPlanCatalog`,
`services/api/src/app.ts` `seedBillingPlans` + webhook handler.*
