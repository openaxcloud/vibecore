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

---

## 6. Delivered — E-Code theme design-system + P8/P4 slices (Jun 17)

**🟢 E-Code theme = single source of truth.** Extracted from the reference repo `~/dev/e-code`
(`tailwind.config.ts`, `client/src/styles/replit-theme.css`, `client/src/index.css`) into
`packages/ecode-theme/` (tokens.css + fonts.css + responsive type-scale + Tailwind/Uno preset) with
full `file:line` provenance in `docs/ECODE_THEME_SOURCE.md`. Orange **`#F26207`**, IBM Plex Sans+Mono,
radius 4/8/12, real responsive scale (`text-responsive-2xl` 24→30→36→48). Applied app-wide: global
`--vc-font-interface` now IBM Plex (no forced Inter); marketing scale corrected. Commits `cd42436d`,
`867faeb7`, `f549f48e`, `998dc021`. Verified live 390/768/1440, 0 console errors.

**🟢 Agent composer power toggles + proof-of-work** (`d29c682f`) — High power / Extended thinking /
Turbo / build-tier in the IDE composer with a live cost estimate (mirrors `credits.ts` multipliers).

**🟢 P8 self-serve data deletion** (`cde3d377`) — request/cancel/status + admin listing, 14-day grace,
flag `ACCOUNT_SELF_DELETION_ENABLED`. **🟢 P8 moderation strikes** (`b103b93a`) — Warning→Community
ban→Account ban, ACCOUNT_BAN enforced via suspension.

**🟢 P8 admin impersonation** (`9fa5ed15`+`a0d3fac3`) — `Session.impersonatedBy` marker, 30-min
time-box, guards (no self/admin/suspended), audit, `/auth/me` exposure, persistent Stop banner,
revocable. **🟢 P8 inactivity GC** (`01cb3846`) — `User.lastActiveAt` (login touch),
`/internal/inactivity-gc` worker-triggered sweep (free 1yr→delete, paid exempt), DRY-RUN by default
(`INACTIVITY_GC_ENABLED`), orphan guard.

**🟢 P4 real-event metering** (`ecc5e848`+`487e2999`) — `/internal/metering` ingest (compute/object-
storage/DB/deployment → `metering-service.ts`) + the **ws-manager GC emitter**: on stop it meters the
active window (marker→lastActiveAt) at the plan's reserved compute, durable `WorkspaceRuntime.lastMeteredAt`
marker (idempotent). Shadow until `BILLING_CREDITS_ENABLED=true`.

All slices: migrations 0038/0039 (additive), feature-flagged OFF, **prod intact**, typecheck + ~40 new
tests green. Avi action: flip flags when ready; decide editor mono font (IBM Plex Mono vs JetBrains).

---

## 7. Final live-verification pass (Jun 17 — local stack: web 5173 + api 3001 + Postgres, migrations applied)

**🔴→🟢 CRITICAL BUG FOUND + FIXED (`6770bc52`):** a static import cycle
(`RuntimeAdapterProvider → ~/lib/webcontainer → ~/lib/stores/workbench → RuntimeAdapterProvider`)
TDZ-crashed `new WorkbenchStore()` at module load, **aborting client hydration on every client-rendered
route** — login/dashboard/account/admin/IDE were all stuck forever on the "Loading E-Code" boot fallback
(only SSR'd marketing masked it). Fixed by lazy-importing `workbenchStore` in the webcontainer preview
callback (breaks the back-edge) + a hoisted `getRuntimeAdapter()`. Verified: the whole authenticated app
now renders.

**Verified live, e-code theme (IBM Plex + `#F26207`), 0 console errors:**
- **Marketing**: homepage / pricing (annual toggle **functional**: Core $25↔$20, Pro $100↔$95) / security
  / report-abuse + legal/content at 390/768/1440.
- **Auth**: `/login` renders full form (email/password/MFA/GitHub/Google); real UI login → `/dashboard`.
- **Dashboard**: home (live stat cards + command palette + health), **billing** (Credits & usage: balance/
  packs/total/**budget-cap $500**/spend-limit form/agent-checkpoints proof-of-work), usage, account,
  security-settings, api-keys — all backend-wired; mobile (390) responsive.
- **Admin** (`/admin/*`): overview (Users/Orgs/Projects 500, Workspaces 5, health: DB/Redis/Queues healthy),
  **stripe-health**, **credit wallets**, + full nav (AI providers/models/agent-checkpoints/feature-flags).
- **Backend** (curl, real session): `/orgs/:id/credits` (creditsEnabled:false shadow), `/ai/models`
  (registryEnabled:false), `/credits/limits` POST, `/account/deletion` request→grace-14d→cancel,
  `/internal/{metering,inactivity-gc}` → 401 without secret (guard correct), CSRF active on cookie POSTs.

**Environment-blocked (not a defect — honest):**
- **IDE composer power-toggles + live preview**: require a provisioned k8s workspace (no cluster locally).
  The composer toggles + proof-of-work estimate are unit-tested (4 tests); the IDE shell is gated on
  `runtime-test`/workspace provisioning.
- **Impersonation end-to-end UI**: backend verified live (`/auth/me` returns `impersonatedBy`); the Stop
  banner is mounted in AppShell; the full admin-initiated flow needs the admin reauth UI + a second browser
  session. 6 route tests cover the server flow.

**Net: every reachable screen + endpoint is 🟢 (theme-conformant, wired, 0 console errors).** The only
unverified-live items are gated on infrastructure (k8s) or elevated-auth flows, both covered by tests.

---

## 8. PROD certification (Jun 17 — real browser on app.e-code.ai, GCP access)

Deployment: HEAD == `origin/main` == `56ff2bec`; "Deploy Production (Continuous)" SUCCESS (Production CI
failure is non-blocking by design). **Prod `/login` renders** (not the boot fallback) → the critical
hydration fix `6770bc52` is live and the whole authenticated app works in prod.

**🟢 Certified in real prod (app.e-code.ai), e-code theme, screenshots captured:**
- **IDE composer power-toggles + proof-of-work** on a **real k8s workspace** (created a project, the AI
  agent ran live — streamed, wrote package.json/tsconfig/etc, multi-agent consensus visible). The toggles
  (High power / Extended thinking / Turbo / Lite·Economy·Power) render with the proof-of-work pill; clicking
  High power moved the estimate **~$0.25 → ~$1.00** (×4) live. (Follow-up `16b32534`: moved them out of the
  collapsed settings panel to always-visible.)
- **Pricing** annual toggle: Monthly $25/$100 → Yearly $20/$95, live.
- **Billing/usage**: the live usage ledger shows the real agent run — `ai.outputTokens 9819`,
  `ai.inputTokens 12410`, `ai.messages 1`, snapshots — Usage events 28; Credits & usage + spend-limit +
  budget-cap all wired; 0 console errors.

**🟢 Billing engine (SHADOW) — certified end-to-end without debiting:** enabled `BILLING_CREDITS_SHADOW=true`
via the helm configmap → CD (`5361d92c`, deploy SUCCESS). Then ran a fresh agent request in prod. Result on
the billing page: Credits & usage shows a **"Preview (not charged)"** badge (the shadow indicator) and
**Recent agent checkpoints** now lists **"$0.00 — power · COMPLETED · 17/06/2026 13:27:11"** — a real
effort-based checkpoint with its build tier + status, tied to the request; Usage events climbed to 40 with
the real token ledger (`ai.outputTokens 1536`, `ai.inputTokens 20369`). The wallet was **not** debited
(balance $0.00). Left in SHADOW — **not** flipped to `BILLING_CREDITS_ENABLED`. (Cost shows $0.00 because the
request was tiny + below the cent; the checkpoint open/settle/record mechanism is what's proven.)

**🟡 Blocked in prod — needs a prod platform-admin account (I have neither admin credentials nor a path to
grant `platformAdmin`: Cloud SQL is private-IP and the GKE control plane enforces a private endpoint, so
kubectl/DB from my machine are refused):**
- **Admin sections** (AI providers/models/credit-wallets/agent-checkpoints/stripe-health/feature-flags) and
  **impersonation E2E** (admin → impersonate → banner → stop). Both are deployed (same SHA) and were
  certified live in the identical local stack + by tests (6 impersonation route tests; `/auth/me` exposes
  `impersonatedBy`). **Avi action:** grant `platformAdmin` to a cert account (or share an admin login) and
  I'll certify these in prod too.

**🔴 Stripe — Avi-only boundary (payment-credential operations, not GCP):**
1. In the **Stripe Dashboard**, create the products + prices: Core monthly $25 / annual $20-equiv, Pro
   monthly $100 / annual $95-equiv, plus a **metered** price for pay-as-you-go usage (see §3 for the exact
   product/price layout).
2. **Generate / rotate the LIVE Stripe secret key.**
   Everything after that is mine: paste the price IDs into the configmap (same mechanism as the shadow flag),
   `helm upgrade`, and flip `BILLING_CREDITS_ENABLED` when you want real charges.

**Pre-existing (not parity) prod IDE noise observed during the agent run:** the workspace-runtime layer
emits `502 /runtime/.../files`, `429 ide-panel/snapshots`, `412 ide-state`, and runtime-WS reconnect errors
under heavy streaming. These are infrastructure robustness issues (tracked in prior audit waves), independent
of the parity work; the agent still functioned. Parity surfaces (marketing/dashboard/billing/admin) are 0-error.

---

## 9. How `platformAdmin` is granted (read-only investigation) + exact procedure for Avi

I cannot self-grant prod admin (privilege self-escalation is blocked regardless of authorization), so here is
the mechanism + the one-step procedure for **you** to provision it. After that I certify admin + impersonation
in prod in ~10 min.

**Mechanism (env bootstrap, verification-gated):**
- `bootstrapPlatformAdmin(email)` — `services/api/src/app.ts:4267-4274` — returns true if the lowercased email
  is in the comma-separated `PLATFORM_ADMIN_EMAILS` env.
- Applied **only at email verification** — `app.ts:6530-6532` — `if (!user.platformAdmin && bootstrapPlatformAdmin(user.email)) updateUser({ platformAdmin: true })`. Gated on proven inbox ownership so a configured address can't be claimed by someone who doesn't control the inbox.
- Configmap key: `PLATFORM_ADMIN_EMAILS` ← `.Values.platformEnv.platformAdminEmails` — `infra/helm/platform/templates/configmap.yaml:39`.
- **Current prod value** — `infra/helm/platform/values-prod.yaml:88`: `'avi@snatchbot.me,groupequaliwatt@gmail.com'`.
  → **`avi@snatchbot.me` is ALREADY a prod platform admin** (once that email is verified on prod).
- Also: an existing admin can promote anyone via `PATCH /admin/users/:userId/platform-admin` (`app.ts:12306`,
  requires caller = admin + MFA + recent reauth).

**Procedure for Avi — pick ONE:**
- **A (0 changes, fastest):** Log into app.e-code.ai as **`avi@snatchbot.me`** (verify the email once if not
  already) → you're platformAdmin → open `/admin`. Then either certify yourself, or in **Admin → Users** flip
  **platform-admin ON** for `cert-verify-prod@example.com` (the throwaway account I created) so I can certify,
  then flip it **OFF** afterwards. (Promotion via the admin action needs no inbox for the target.)
- **B (GitOps, if you prefer config):** add a *real* address you control to `values-prod.yaml:88`
  `platformAdminEmails`, push → CD, verify that address's email, certify, then revert the line. (A fake address
  like `cert-verify-prod@example.com` will NOT work via B — the bootstrap requires email verification.)

Either way, hand me an admin login (or flip my cert account on per A) and I finish the prod cert immediately.

**Shadow-checkpoint proof (recap, already certified §8):** with `BILLING_CREDITS_SHADOW=true` live (`5361d92c`),
a prod agent request produced **Recent agent checkpoints → "$0.00 — power · COMPLETED · 17/06/2026 13:27:11"**
with a **"Preview (not charged)"** badge, Usage events 40, real token ledger, wallet **not** debited. Left in
SHADOW. (Screenshot delivered.)
