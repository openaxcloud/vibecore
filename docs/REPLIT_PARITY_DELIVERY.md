# VibeCore ↔ Replit Parity — Delivery Document

> **Status as of 2026-06-17.** Companion to `docs/REPLIT_PARITY_SPEC.md` (design) — this
> document is the **delivery + status** record: the model explained, an honest per-point
> parity checklist, the exact Stripe go-live runbook, and the list of actions that require Avi.
>
> **Honesty rule:** an item is marked **🟢 done+verified-live** only if it is coded, tested, AND
> exercised in a running browser/API. Coded+tested-but-not-yet-browser-verified is **✅**.
> Foundation-laid-wiring-remaining is **🟡**. Not-started is **⏳**. Anything that literally
> depends on Avi (Stripe products, Starter credit amount) is listed separately in §4.
>
> **Everything below is behind feature flags (off by default): production billing is unchanged.**

---

## 1. The model (Replit-identical)

### Plans — monthly AND annual
| Plan | Monthly | Annual (eff/mo) | Included credits | Collaborators | Viewers | Parallel agents | DB rollback | Notable |
|------|--------:|----------------:|------------------|--------------:|--------:|----------------:|------------:|---------|
| **Starter** | $0 | — | daily Agent credits | 1 | — | 1 | — | built-in DB, publish 1 project, private/password deploys |
| **Core** | $25 | $20 (−20%) | $25/mo | 5 | — | 2 | — | unlimited workspaces, any region, remove badge, AI integrations |
| **Pro** | $100 | $95 (−5%) | $100/mo | 15 | 50 | 10 | 28 days | most powerful models, premium support |
| **Enterprise** | custom | custom | custom | custom | custom | custom | custom | SSO/SAML/SCIM, single-tenant, VPC, static IPs, data warehouse |

### Credits & effort-based
- **Wallet** in USD cents per org (`CreditWallet`); grants monthly (Core/Pro) or daily (Starter);
  **Pro rolls over 1 month**; **credit packs** (6-month expiry, earliest-expiry-first consumption).
- **One checkpoint per Agent request** (`AgentCheckpoint`), no intermediates; cost = real effort
  (tokens + wall-time + compute) × margin (`AI_MARGIN`, internal, default 0.30; displayed prices = Replit).
- **Per-request power controls:** High-power model, Extended-thinking, **Turbo** (≤6×), build tiers
  (Lite/Economy/Power). Cost shown as **proof-of-work**; consumption draws packs then balance.

### Pay-as-you-go & spend caps
- Beyond included credits → **Stripe metered** usage (`reportUsage`), with **Usage Limit** +
  **Service Shutdown Limit** ($500-increment org budgets; $0.01 = restrict-to-credits) and
  50/80/100% alerts.

### Compute metering (exact Replit rates — `packages/billing/compute-pricing.ts`)
- 1 CPU-s = 18 CU, 1 GB-s = 2 CU; **$3.20 / M CU**, **$1.20 / M requests**, Autoscale base **$1/mo**;
  Reserved VM **$20/$40/$80/$160**; object storage **$0.03/GiB-mo + $0.10/GiB + Class A $0.0006/1k +
  Class B $0.0075/1k**; DB by active hours.

### Admin owns keys + global model registry
- DB registry `ProviderConfig`/`ModelConfig`: admin enables providers AND models; users see/use only
  enabled models (per plan); per-user key entry removed (`VITE_BYOK_DISABLED`, Enterprise exempt).

### Feature flags (all off → no behaviour change)
`BILLING_CREDITS_ENABLED`, `BILLING_CREDITS_SHADOW`, `BILLING_PAYG_ENABLED`, `MODEL_REGISTRY_DB`,
`VITE_BYOK_DISABLED`.

---

## 2. Parity checklist (honest per-point status)

### Plans & pricing
- 🟢 In-repo SSR pricing page, 4 tiers, **monthly/annual toggle functional** (Core $25↔$20, Pro
  $100↔$95), comparison table, responsive 390/768/1440, 0 console errors.
- ✅ `creditPlanCatalog` + entitlements; checkout backend `interval=monthly|annual` + distinct price
  ids + webhook multi-id plan resolution.
- ⏳ Annual toggle in the `/upgrade` form UI (backend accepts it).

### Effort-based / credits
- ✅ `AgentCheckpoint` (one/request) + settle (packs→balance) + shadow mode, **wired into record-usage**.
- ✅ Monthly/daily grants + Pro rollover + credit packs (6-mo, earliest-first).
- ✅ High-power / Extended-thinking / **Turbo** / build tiers (schema + estimate math).
- 🟢 **Proof-of-work** visible in Billing (checkpoints with cost + flags) — browser-verified.
- ⏳ Power toggles + live cost-preview in the **IDE agent composer**.

### AI billing / PAYG / spend caps
- ✅ Token cost + margin; real debit packs→balance (full) / shadow.
- ✅ PAYG primitives: `createMeteredPrice` + `reportUsage` (idempotent).
- 🟢 Spend caps: `/credits/limits` endpoint ($500-increment) + **billing form UI** + alert math.
- ⏳ Service-Shutdown enforcement at the services layer + alert delivery.

### Compute metering
- ✅ Exact rates + metering service (`meterWorkspaceCompute/ObjectStorage/Database/Deployment`).
- ⏳ **Wire to real events** (workspace-manager GC→api, deploys, storage ops) + last-metered marker.

### Admin / registry
- 🟢 Registry: store + boot seed + read-through `/orgs/:id/ai/models`.
- ✅ Admin sections `/admin/{providers,models,wallets,checkpoints}` + toggles (audited).
- ⏳ Admin **impersonation** + Stripe key health + advanced plan/quota editing.

### Settings-tab mapping (§11)
- 🟢 User sections visible in Dashboard sidebar (Usage/Billing/Account/Connected/Notifications) +
  **Billing/Usage/Credits** (#1 gap) browser-verified.
- ✅ Removed: per-user provider toggles + Debug/Task-Manager/Event-Logs/Update/Service-Status
  (→ `developer`) + **BYOK_DISABLED** chat key entry.
- ⏳ Render Profile/Preferences/Data/MCP-personal as Dashboard pages (vs modal) + `me.isPlatformAdmin`.

### Marketing site
- 🟢 **15 pages in-repo SSR** browser-verified: `/`, `/pricing`, `/features`, `/mobile`, `/ai`,
  `/deployments`, `/team`, `/terms`, `/privacy`, `/security`, `/dpa`, `/student-dpa`,
  `/subprocessors`, `/report-abuse`, `/marketing/:slug`.
- ✅ **19 content pages authored in-repo** (Remix SSR, e-code tone, responsive) via parallel
  sub-agents, full web typecheck+lint green: about, careers, contact, contact-sales, press,
  partners, forum, help-center, tutorials, changelog, case-studies, accessibility (wave 1);
  blog, desktop, collaboration, commercial-agreement, status, languages, compare-index (wave 2).
  (Browser-verify pending in the final pass.)
- ⏳ **~5 functional/dynamic routes kept on the external bundle** (would break if converted blindly):
  `templates.languages` (needs template catalog data), `compare.$slug` + `solutions.$slug`
  (slug-driven), `newsletter.confirm` + `newsletter.unsubscribe` (token-based actions).

### Legal / security (P8)
- 🟢 security/terms/privacy/dpa/report-abuse pages live in-repo.
- ⏳ Mechanisms: **strike system**, **inactivity GC** (free 1 year), **data-deletion self-serve**,
  abuse-report wiring, public-app MIT licensing.

### Data model & foundation
- ✅ Migrations 0036/0037 + ~120 unit tests green.
- 🟢 **Prod-critical fix** `Plan.limits` (a P0 regression) — fixed, API boot verified locally.

---

## 3. Stripe go-live runbook (step by step)

Code reads price ids by convention `STRIPE_<KEY>_PRICE_MONTHLY_ID` / `_ANNUAL_ID` plus existing secrets.

**A. Products & prices** (Stripe Dashboard → Products):
1. **Core** → recurring **$25/month** + recurring **$240/year** ($20/mo). Copy both price ids.
2. **Pro** → **$100/month** + **$1140/year** ($95/mo). Copy both.
3. **PAYG AI** → **metered** recurring price (usage `sum`). Copy id.
4. **PAYG Compute** → **metered** recurring price. Copy id.
5. Starter/Enterprise → no self-serve price.

**B. Webhooks** (endpoint `https://app.e-code.ai/billing/stripe/webhook`): keep the current 7, **add**
`invoice.created`, `invoice.upcoming`. Copy the signing secret.

**C. Config** — `infra/helm/platform/values-prod.yaml` configmap:
```
STRIPE_CORE_PRICE_MONTHLY_ID, STRIPE_CORE_PRICE_ANNUAL_ID,
STRIPE_PRO_PRICE_MONTHLY_ID,  STRIPE_PRO_PRICE_ANNUAL_ID,
STRIPE_PAYG_AI_PRICE_ID, STRIPE_PAYG_COMPUTE_PRICE_ID, AI_MARGIN=0.30
```
Secrets (Secret Manager): `STRIPE_SECRET_KEY` (**rotate the live key at go-live**), `STRIPE_WEBHOOK_SECRET`.

**D. Sequence:** create products → put ids in configmap + secrets → `helm upgrade` (CD) → verify
`/admin/billing` shows plans seeded with the ids → backfill subs `pro/team`→`core/pro` (script) →
flip `BILLING_CREDITS_SHADOW=true` (validate cost accuracy vs `AiCostLedger`) → then
`BILLING_CREDITS_ENABLED=true` canary → global. Enable `MODEL_REGISTRY_DB` and `VITE_BYOK_DISABLED`
when ready.

---

## 4. Actions that require Avi (cannot be done from code)

1. **Stripe**: create the monthly+annual+metered products/prices above, paste ids into the configmap,
   **rotate the live key**. (I cannot create your Stripe products.)
2. **Confirm the Starter daily-credit dollar amount** — Replit does not publish it; default is 25¢/day.
3. **Decide** on the ~24 content pages: rewrite in-repo (I can, large content batch) or keep on the
   external bundle.
4. **Flip the flags** when ready (shadow → enforce sequence above). Nothing bills without you.
5. (Optional) provide access to the **external marketing repo** if you'd rather I rebuild its bundle
   than rewrite pages in-repo.

---

## 5. Remaining build (tracked, in progress)

Power toggles + cost-preview in the **agent composer**; **metering wired to real events**; **admin
impersonation**; **P8 mechanisms** (strike/inactivity/data-deletion/abuse/licensing); **24 content
pages**; annual toggle in `/upgrade`; render remaining Account pages in the Dashboard. Each verified
responsive (390/768/1440, 0 console errors) before being marked 🟢.
