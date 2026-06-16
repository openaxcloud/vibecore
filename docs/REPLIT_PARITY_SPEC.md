# VibeCore ↔ Replit Parity — Implementation Spec

> **Status:** Draft 1 (2026-06-16) — foundation in progress.
> **Owner:** Avi (platform admin / AI-cost absorber).
> **Goal:** Replicate Replit's commercial model (plans + credits wallet + effort‑based
> metering + pay‑as‑you‑go + compute billing + admin‑owned model registry) on VibeCore,
> **without breaking the existing flat‑rate billing** until the new system is validated.
> Migration is **feature‑flagged and progressive**.

---

## 0. Guardrails (non‑negotiable)

1. **Never break production billing.** The current flat‑rate Stripe subscriptions
   (`free`/`pro`/`team`/`enterprise`) keep working until the credits system is proven.
   All new behaviour sits behind `BILLING_CREDITS_ENABLED` (org‑level + global kill‑switch).
2. **Admin absorbs AI cost.** Users can use **only** models the admin enabled. Platform keys
   live in secrets, chosen by the admin. Per‑user BYOK is removed from the default UX
   (kept optional for Enterprise only).
3. **The credit price charged to the user must cover real cost** (provider tokens + compute)
   with a configurable margin, so Avi never loses money on AI.
4. **Progressive rollout.** New data model ships first (dormant), then metering in shadow
   mode (compute but don't enforce), then enforcement, then real Stripe money. Each step is a
   committable batch with tests, green CI, no `--no-verify`.

---

## 1. Current state (mapped to code)

### 1.1 Plan catalog — `packages/billing/src/index.ts`
- `BillingPlan` interface (`:36`): `{ key, name, monthlyCents, stripeProductEnv, stripePriceEnv, limits, features }`.
- `PlanKey = 'free' | 'pro' | 'team' | 'enterprise'`.
- `QuotaKey` union (`:15‑32`): `projects.count`, `workspaces.active`,
  **`workspaces.runtimeMinutes`** (declared, never metered), `workspace.cpuMillicores`,
  `workspace.ramMb`, `storage.gb`, `snapshots.count`, `snapshots.sizeMb`, `ai.messages`,
  `ai.inputTokens`, `ai.outputTokens`, `ai.toolCalls`, `deployments.count`, `previews.public`,
  `team.members`, `terminals.concurrent`, `api.rateLimitPerMinute`.
- Plans today: Free $0 / Pro $2900 / Team $9900 / Enterprise $0 (custom). Monthly only — **no annual price**.
- `StripeBillingClient` (`:267‑401`): checkout, portal, invoices, createCustomer/Product/Price.
  API pinned `2024-06-20`. `verifyStripeSignature` supports key rotation.

### 1.2 AI pricing — `packages/billing/src/ai-pricing.ts`
- `computeAiCostCents` (`:186`): `ceil((in*inputCentsPerMillion + out*outputCentsPerMillion)/1e6)`.
- Per‑model price table (`:36‑154`), 13 models, with per‑plan eligibility flags.

### 1.3 Prisma — `packages/database/prisma/schema.prisma`
- `Organization` (`:126`) ↔ `BillingCustomer` (1:1, `:668`), `Subscription[]` (`:679`),
  `UsageEvent[]` (`:712`), `QuotaLedger[]` (`:725`, **unused**), `QuotaOverride[]` (`:738`),
  `AiCostLedger[]` (`:818`).
- `Subscription` carries `status` (`TRIALING|ACTIVE|PAST_DUE|CANCELED|UNPAID`),
  `currentPeriodStart/End`, `lastStripeEventAt` (out‑of‑order guard).
- `Plan` (`:701`): `key`, `monthlyCents`, `limits Json`, `stripeProductId`, `stripePriceId`.
- `UsageEvent` (`:712`): `{ organizationId, userId?, type, quantity, metadata, createdAt }` — the
  consumption ledger that quota enforcement sums.
- `AiCostLedger` (`:818`): records provider/model/tokens/`costCents` per call —
  **computed but never deducted from any balance**.
- **No Wallet / Credit / Balance model. No metered Stripe billing.**

### 1.4 Quota enforcement — `services/api/src/app.ts`
- `ensureQuota(request, orgId, key, increment)` (`:9606`) → `billingState` + `QuotaOverride`
  + `usageForQuota` + `assertQuota` (throws 429 `QUOTA_EXCEEDED`).
- `computeUsageForQuota` (`:9469`): per‑key source/window. Period‑scoped keys use
  `resolveUsagePeriodStart` (`:9446`) = `subscription.currentPeriodStart` else start of UTC month.
- **`workspaces.runtimeMinutes` has no case → never enforced.**

### 1.5 Stripe routes — `services/api/src/app.ts`
- `GET /orgs/:orgId/billing` (`:15976`), `POST .../checkout` (`:16002`),
  `POST .../portal` (`:16119`), `GET .../invoices` (`:16158`), `POST /billing/stripe/webhook` (`:16199`),
  `GET /admin/billing` (`:16742`).
- Webhook events handled (7): `checkout.session.completed`,
  `customer.subscription.{created,updated,deleted}`, `invoice.{payment_failed,paid,finalized}`.
- Plan→price mapping seeded from env at boot (`seedBillingPlans`, `:5595`):
  `STRIPE_<PLAN>_PRODUCT_ID` / `STRIPE_<PLAN>_PRICE_ID`. Secrets in helm
  `infra/helm/platform/values-prod.yaml` (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`),
  price IDs in configmap.

### 1.6 AI gateway — `services/ai-gateway/src/gateway.ts`
- `modelCatalog` (`:123‑205`): **hardcoded array**, filtered by `plan` in `route()` (`:663`).
- Keys: **env vars only** (`bearer()` `:256`, `configured()` `:252`). Fallback chain via
  `AI_FALLBACK_PROVIDERS`.
- `estimateCost()` (`:248`) returns `usage.estimatedCostCents` on complete/stream.
- Agent runs: `executeAgentRun()` / `…Stream()` (`agent-executor.ts:495/604`), `runId` per call,
  parallel roles, consensus. **Per‑role costs are NOT aggregated into one checkpoint cost.**
- Frontend model list `app/routes/api.models.ts` reads **cookie BYOK** keys
  (`getApiKeysFromCookie`). User‑entered keys live in `CloudProvidersTab.tsx` / `LocalProvidersTab.tsx`.

### 1.7 Compute lifecycle — `services/workspace-manager`
- `WorkspaceRuntime` (schema `:1253`): `status`, `createdAt`, `lastActiveAt`,
  index `[status, lastActiveAt]`.
- `touch()` (`manager.ts:524`) bumps `lastActiveAt` (≤ every 30 s) on agent‑token mint / preview.
- GC sweep `#garbageCollect()` (`manager.ts:430`) already computes `now - lastActiveAt`;
  triggered by worker `workspace.gc` (`worker/src/index.ts:204`, default 30 m inactive / 24 h delete).
- **No integrated per‑project DB** ("DB intégrée" Replit feature) exists — only external Supabase connector.

### 1.8 Settings / admin / dashboard
- 18 settings tabs registry: `app/components/@settings/core/constants.tsx` (labels `:79`,
  config `:123`) + `ControlPanel.tsx` (lazy map `:16`, switch `:126`). All `window:'user'`.
  Reachable only at `/settings` and `/settings/:tab` — **not linked anywhere in the SaaS shell**.
- Admin SPA `/admin/:section` (`app/routes/admin.$section.tsx`), ~20 sections incl. `users`,
  `organizations`, `quotas`, `ai-usage`, `costs`, `feature-flags`, `system-settings`,
  `provider-health`. Gated by API `PLATFORM_ADMIN_REQUIRED` (403) + MFA + 5‑min re‑auth for billing.
- Dashboard `app/routes/dashboard.tsx` + nav `SaaSLayout.tsx` (`:246‑283`): groups Workspace /
  Organization (Usage, Billing, Team, Support) / Account (Account settings, Security, API keys,
  Connected accounts, Notifications).

---

## 2. Target model (Replit parity)

### 2.A Plans

| Plan | Key | Monthly | Annual (eff/mo) | Included credits | Collaborators | Viewers | Parallel agents | Models | DB rollback | Notable |
|------|-----|--------:|---------:|------------------|--------------:|--------:|---------------:|--------|-------------|---------|
| **Starter** | `starter` | $0 | — | **Daily free Agent credits** (e.g. small daily grant, no rollover) | 1 | 0 | 1 | base models only | — | DB intégrée, publish **1** project, private/password deploys |
| **Core** | `core` | $25 | $20 ($240/yr, ~20% off) | **$25/mo** credit grant | 5 | — | 2 | + integrations | — | unlimited workspaces, publish any region, remove "Made with VibeCore" badge |
| **Pro** | `pro` | $100 | $95 ($1140/yr, ~5% off) | **$100/mo** credit grant | 15 | 50 | 10 | **most powerful models** | **28 days** | premium support |
| **Enterprise** | `enterprise` | custom | custom | custom | custom seats | custom | custom | all | custom | SSO/SAML, privacy controls, design system, data warehouse, groups, dedicated support, single‑tenant, region select, static egress IPs, VPC peering |

> **Plan‑key migration.** New keys are `starter`/`core`/`pro`/`enterprise`. The legacy
> `free`/`pro`/`team` keep working during transition (mapped: `free→starter`, `pro→core`,
> `team→pro`). The catalog ships **both** key sets behind the flag; only the new pricing page
> exposes the new keys. Existing subscriptions are migrated by a backfill job once Stripe
> products exist (Step 3).

Billing intervals: **monthly and annual** (Stripe price per interval per plan).

### 2.B Credits + effort‑based + pay‑as‑you‑go

- **Wallet per org** holding a USD‑cent balance. Monthly grant by plan (Starter = daily grant,
  no rollover; Core/Pro = monthly grant). Grants and consumption are an append‑only ledger.
- **Effort‑based checkpoint.** Each agent *request* = **one checkpoint** whose cost reflects real
  effort (wall‑time + compute + tokens), bundled — **no intermediate charges**. Simple < $0.25,
  complex more. Cost shown in the agent UI (proof‑of‑work).
- **Per‑request power controls:** `High power model` (more capable model) and
  `Extended thinking` (longer reasoning) cost more credits.
- **Pay‑as‑you‑go.** Beyond included credits, keep serving and bill usage via **Stripe metered**
  (usage records) with guard‑rails: **budget cap**, **alerts** (50/80/100 %), hard stop at cap.
- **Margin.** `creditCostCents = ceil(rawProviderCostCents * (1 + AI_MARGIN) + computeCostCents)`.
  `AI_MARGIN` configurable (default e.g. 0.30). Charged credits always ≥ real cost.

### 2.C Compute billing
- Meter `workspaces.runtimeMinutes` for real (today declared‑only), deployments, and any compute,
  debited from the wallet/usage like Replit.

### 2.D Admin keys + global model registry
- DB registry `ProviderConfig` + `ModelConfig`: admin enables/disables providers **and** models
  platform‑wide. Users see/use **only enabled** models. Default user BYOK removed; keys are
  platform secrets chosen by the admin. (BYOK stays optional for Enterprise.)

### 2.E Pricing marketing page — reflect the four offers exactly (monthly/annual toggle, credits,
parallel agents, collaborators/viewers, rollbacks, regions, badge removal, SSO…).

### 2.F Admin oversight — credits/balances per org, effort‑based usage, pay‑as‑you‑go, compute
metering, provider/model registry, editable plans/quotas, Stripe key health, users
(+impersonation), feature flags, upstream bolt status.

---

## 3. Data model changes (Prisma)

New models in `packages/database/prisma/schema.prisma` (additive — no destructive change):

```prisma
// --- Credits wallet ---------------------------------------------------------
model CreditWallet {
  id              String   @id @default(cuid())
  organizationId  String   @unique
  balanceCents    Int      @default(0)        // current spendable balance
  currency        String   @default("usd")
  budgetCapCents  Int?                         // pay-as-you-go hard cap (null = no PAYG)
  autoTopupCents  Int?                         // optional auto-refill trigger
  updatedAt       DateTime @updatedAt
  organization    Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  entries         CreditLedger[]
}

// Append-only. balanceCents on wallet is the materialized sum of entries.
model CreditLedger {
  id              String   @id @default(cuid())
  walletId        String
  organizationId  String
  deltaCents      Int                          // + grant / refund, - consumption
  kind            CreditEntryKind              // GRANT|CONSUMPTION|PAYG_CHARGE|REFUND|ADJUSTMENT|EXPIRY
  reason          String
  checkpointId    String?                      // links a CONSUMPTION to its checkpoint
  expiresAt       DateTime?                    // for daily/monthly grants that don't roll over
  metadata        Json?
  createdAt       DateTime @default(now())
  wallet          CreditWallet @relation(fields: [walletId], references: [id], onDelete: Cascade)
  @@index([organizationId, createdAt])
  @@index([checkpointId])
}

enum CreditEntryKind { GRANT CONSUMPTION PAYG_CHARGE REFUND ADJUSTMENT EXPIRY }

// --- Effort-based checkpoint (one per agent request) ------------------------
model AgentCheckpoint {
  id               String   @id @default(cuid())
  organizationId   String
  userId           String?
  projectId        String?
  conversationId   String?
  runId            String?                      // ai-gateway agent runId, if any
  status           CheckpointStatus             // PENDING|COMPLETED|FAILED
  highPowerModel   Boolean  @default(false)
  extendedThinking Boolean  @default(false)
  // effort inputs
  inputTokens      Int      @default(0)
  outputTokens     Int      @default(0)
  wallMs           Int      @default(0)
  computeCents     Int      @default(0)         // runtime/compute attributed to this request
  rawProviderCents Int      @default(0)         // real provider token cost
  // outcome
  creditCents      Int      @default(0)         // what the user was charged (>= real cost)
  startedAt        DateTime @default(now())
  completedAt      DateTime?
  organization     Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  @@index([organizationId, startedAt])
  @@index([projectId])
  @@index([runId])
}

enum CheckpointStatus { PENDING COMPLETED FAILED }

// --- Admin-owned provider/model registry ------------------------------------
model ProviderConfig {
  id            String   @id @default(cuid())
  provider      String   @unique               // 'openai'|'anthropic'|...
  displayName   String
  enabled       Boolean  @default(false)
  apiKeySecret  String?                         // secret-manager key name (NOT the key itself)
  baseUrl       String?
  byokAllowed   Boolean  @default(false)        // Enterprise opt-in only
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  models        ModelConfig[]
}

model ModelConfig {
  id                 String   @id @default(cuid())
  providerConfigId   String
  modelId            String                      // 'gpt-4.1' etc.
  displayName        String
  enabled            Boolean  @default(false)
  enabledPlans       Json                        // ['core','pro','enterprise']
  isHighPower        Boolean  @default(false)     // counts as "High power model"
  supportsThinking   Boolean  @default(false)
  inputCentsPerM     Int
  outputCentsPerM    Int
  contextWindow      Int
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt
  providerConfig     ProviderConfig @relation(fields: [providerConfigId], references: [id], onDelete: Cascade)
  @@unique([providerConfigId, modelId])
}
```

Also: add `intervals` (monthly+annual price ids) to `Plan` — either two nullable columns
(`stripePriceMonthlyId`, `stripePriceAnnualId`) or a `PlanPrice` child table. Keep
`stripePriceId` for backward compat (= monthly).

`QuotaLedger` (currently dead) is repurposed/ignored — wallet is the source of truth for credits;
`UsageEvent` remains the source for fixed quotas (projects, workspaces, deployments…).

Migrations are additive (`0026_credits_wallet`, `0027_provider_registry`, `0028_plan_intervals`).
Default state: wallets empty, registry seeded from current `modelCatalog`, flag OFF → zero behaviour change.

---

## 4. Plan catalog rewrite — `packages/billing`

- Extend `PlanKey` to include `'starter' | 'core'` (keep `free|pro|team` aliases during migration).
- Add to `BillingPlan`: `annualCents`, `includedCreditCents`, `dailyCreditCents?`,
  `parallelAgents`, `collaborators`, `viewers`, `dbRollbackDays`, `badgeRemovable`,
  `stripePriceAnnualEnv`. Keep `limits` (fixed quotas) for compute/storage guard‑rails.
- New env keys: `STRIPE_CORE_PRICE_MONTHLY_ID`, `STRIPE_CORE_PRICE_ANNUAL_ID`,
  `STRIPE_PRO_PRICE_MONTHLY_ID`, `STRIPE_PRO_PRICE_ANNUAL_ID`,
  `STRIPE_PAYG_AI_PRICE_ID`, `STRIPE_PAYG_COMPUTE_PRICE_ID` (metered).
- `assertQuota` / `computeAiCostCents` unchanged; add `computeCreditCost(checkpoint, margin)`.

---

## 5. Credits wallet + effort‑based metering

**Wallet service** (`packages/billing` + store methods in `services/api/src/prisma-store.ts`):
- `getWallet(orgId)`, `grantCredits(orgId, cents, kind, reason, expiresAt?)`,
  `debitCredits(orgId, cents, checkpointId, reason)` (atomic; uses
  `store.withSerializedMutation('wallet:'+orgId, …)` like deploy quota to avoid races),
  `materializeBalance(orgId)`.
- Monthly grant on `invoice.paid` / period rollover; daily grant for Starter via worker cron.
- Expiring grants: `EXPIRY` ledger entries written by worker when `expiresAt` passes.

**Checkpoint lifecycle** (one per agent request):
1. **Pre‑flight** (before stream): create `AgentCheckpoint(PENDING)`, estimate cost from
   input‑token estimate + selected model + power toggles; check wallet balance OR PAYG cap.
   Reuse the existing pre‑flight hook `checkChatQuota()` (`app/lib/.server/ai-usage.ts:154`) —
   extend it to also reserve credits. Fail‑closed only when balance is truly 0 and no PAYG.
2. **Execute** through ai‑gateway. For agent runs, **sum all role costs** under one `runId`
   (`agent-executor.ts` — aggregate the per‑role `usage.estimatedCostCents`).
3. **Settle** (onFinish): compute `rawProviderCents` (real tokens) + `computeCents`
   (wall‑time × compute rate), `creditCents = ceil(raw*(1+margin)+compute)`; `debitCredits`;
   mark checkpoint `COMPLETED`; write `AiCostLedger` (already exists) for accounting.
   Replaces the fire‑and‑forget `recordChatUsage()` (`ai-usage.ts:240`) with a credit‑aware settle.
4. **UI proof‑of‑work:** return `creditCents` + breakdown so the agent panel shows the checkpoint cost.

Shadow mode (`BILLING_CREDITS_SHADOW=true`): compute and record everything but **do not** block
or debit — lets us validate cost accuracy against `AiCostLedger` before charging real users.

---

## 6. Per‑request power controls

- Extend `AiChatRequest` / agent request with `highPowerModel?: boolean` and
  `extendedThinking?: boolean` (ai‑gateway `gateway.ts`, `agent-executor.ts`).
- `highPowerModel` → route to a `ModelConfig.isHighPower` model the org's plan allows.
- `extendedThinking` → map to reasoning budget (today only `isReasoningModel()` auto‑detect at
  `app/lib/.server/llm/constants.ts:46`; add explicit `reasoningEffort`/thinking‑budget plumbing
  in `stream-text.ts:112`). Both raise the estimated checkpoint cost.
- UI toggles in the agent composer; cost preview updates live.

---

## 7. Pay‑as‑you‑go (Stripe metered)

- Add metered Stripe prices (AI usage + compute). On wallet hitting 0 with PAYG enabled and under
  `budgetCapCents`, keep serving and **report usage records** to the subscription's metered item.
- New `StripeBillingClient.reportUsage({ subscriptionItemId, quantity, timestamp, action })`.
- Track `subscriptionItemId` per metered price on the `Subscription` (new nullable columns or a
  `SubscriptionItem` child table).
- Alerts at 50/80/100 % of cap via `UsageEvent` + notification; hard 402 at cap.
- New webhook events to handle: `invoice.created` (attach pending usage), `invoice.upcoming`
  (alerting), and (Billing Meters API) meter events if we adopt the new Stripe Meters.

---

## 8. Compute metering (runtime minutes / deployments / DB)

- **Runtime minutes:** add `computeUsageForQuota` case for `workspaces.runtimeMinutes`
  (period‑scoped `sumUsage`). Meter in the **GC sweep** (`workspace-manager/src/manager.ts:430`,
  which already computes elapsed) **and** on stop/delete: emit
  `recordUsageEvent(orgId,'workspaces.runtimeMinutes', minutes)` and a wallet debit when credits
  on. Use an idempotent "last metered at" marker per workspace to avoid double counting across
  sweeps (store on `WorkspaceRuntime`).
- **Enforce before start:** `ensureQuota(request, orgId, 'workspaces.runtimeMinutes')` at the
  runtime‑start endpoint.
- **Deployments:** already counted (`deployments.count`); add per‑deploy credit debit when on.
- **DB intégrée:** new feature (out of MVP scope) — track once a per‑project DB exists; for now
  document as Enterprise/external Supabase only.

---

## 9. Admin model registry + platform keys

- Seed `ProviderConfig`/`ModelConfig` from the current hardcoded `modelCatalog`
  (`services/ai-gateway/src/gateway.ts:123`) via migration.
- ai‑gateway `route()` reads the **DB registry** (cached, hot‑reloaded) instead of the hardcoded
  array; filters by `enabled` + `enabledPlans`. Keys resolved from `apiKeySecret` (secret manager),
  not env literals (keep env fallback during transition).
- `app/routes/api.models.ts` returns only admin‑enabled models; **ignore cookie BYOK** unless the
  org is Enterprise with `byokAllowed`. Hide/disable `CloudProvidersTab`/`LocalProvidersTab` key
  entry for non‑Enterprise (see §11 mapping).
- Admin UI: new `/admin/providers` + `/admin/models` sections to toggle providers/models, set
  pricing, plan eligibility, high‑power/thinking flags, and view key health.

---

## 10. Pricing marketing page

- `app/routes/pricing.tsx` currently delegates to the static eCode shell
  (`ecodeMarketingShellLoader`). Rebuild a real pricing page reflecting §2.A: monthly/annual
  toggle, four tiers, included credits, parallel agents, collaborators/viewers, DB rollback days,
  region/badge/SSO rows, CTA → `/upgrade?plan=core&interval=annual`.
- `app/routes/upgrade.tsx` + `billing.tsx`: add interval selection; pass `interval` to checkout;
  resolve the right Stripe price id.

---

## 11. Settings tabs → Admin vs User mapping (answer to Avi's question)

**Today:** all 18 tabs are `window:'user'` and the panel is **orphaned** (only `/settings` URL,
no nav link). Bolt's model assumed the *end‑user supplies their own keys*. VibeCore's model is the
opposite: **the platform admin owns providers/keys/integrations**; users get a clean product
surface. So provider/integration/diagnostic tabs move to **Admin (global)**, and the genuinely
personal tabs stay **User** but must be **surfaced in the Dashboard** (they're invisible now).

### → ADMIN (global / platform), move into the `/admin` SPA

| Tab | Why admin | Where in admin |
|-----|-----------|----------------|
| **Cloud Providers** | Platform keys; admin enables providers/models | `/admin/providers` (new) — backs §9 registry |
| **Local Providers** | Same (Ollama/local) | `/admin/providers` |
| **MCP** | Platform‑wide MCP servers/catalog | `/admin/mcp` (new) or fold into providers |
| **Service Status** | Platform health/SLA | `/admin/health` (exists) |
| **Event Logs** | Platform/audit activity | `/admin/audit-logs` / `/admin/security-events` (exist) |
| **Update** | Upstream bolt.diy status — platform concern | `/admin/system-settings` → "Upstream" panel |
| **Debug** | Runtime diagnostics — admin/support | `/admin/system-settings` → "Diagnostics" (keep a read‑only user view, see below) |
| **Features** (flags) | Platform rollout control | `/admin/feature-flags` (exists) — admin owns; user sees read‑only enabled features |

Integration connectors are **dual‑scope** (see note): **GitHub / GitLab / Netlify / Vercel /
Supabase** — the *platform OAuth app credentials* (client id/secret, webhook secrets) are
**Admin** (`/admin/system-settings` → "Integrations"); the *per‑user account connection*
(authorize my GitHub) stays **User** and is surfaced in the Dashboard "Connected accounts".

### → USER (personal), surface in the **Dashboard**

| Tab | Keep as user because | Surface at |
|-----|----------------------|-----------|
| **Profile** | avatar/username/bio | Dashboard → **Account → Profile** (`/account-settings`) |
| **Settings** | theme/language/timezone/shortcuts | Dashboard → **Account → Preferences** |
| **Notifications** | personal notifications | Dashboard → **Account → Notifications** (nav already lists it) |
| **Data Management** | user's local IndexedDB export/clear | Dashboard → **Account → Data & privacy** |
| **Connections** (status view) | which of *my* accounts are linked | Dashboard → **Account → Connected accounts** |
| **GitHub/GitLab/Netlify/Vercel/Supabase** (connect *my* account) | personal OAuth link | Dashboard → **Account → Connected accounts** (one card per provider) |
| **Task Manager** | local browser data | Dashboard → **Account → Data & privacy** (or drop; low value in SaaS) |
| **Debug** (read‑only "download my logs") | self‑service support | Dashboard → **Account → Help/Support** |

**Surfacing mechanism:** add the missing links in `SaaSLayout.tsx` "Account" group
(`:246‑283`) so the existing `/settings/:tab` (alias‑routed, `settings.$tab.tsx:8`) tabs are
reachable, and gate provider/integration‑credential tabs behind an `isPlatformAdmin` check
(reuse the API `PLATFORM_ADMIN_REQUIRED` signal — expose a small `me.isPlatformAdmin` flag to the
client so the UI hides admin‑only tabs instead of 403‑ing).

**Net effect:** users get Profile/Preferences/Notifications/Data/Connected‑accounts in the
Dashboard; admins get Providers/Models/MCP/Health/Logs/Flags/Integrations/Upstream/Diagnostics in
`/admin`. The "enter your own API key" surface is removed for non‑Enterprise.

---

## 12. Admin oversight additions

Add/extend `/admin` sections: `providers`, `models` (registry + key health), `wallets`
(per‑org balance, grants, manual adjust), `checkpoints` (effort‑based usage), `payg` (caps,
overages), `compute` (runtime minutes/deploys), editable `plans`/`quotas` (exist partially),
Stripe key health (ping `GET /v1/balance`), `users` (+impersonation — new), `feature-flags`
(exist), upstream bolt status. Most list endpoints already exist (`admin.$section.tsx`); we add
data sources for wallet/checkpoint/registry.

---

## 13. Feature‑flag & migration plan

Flags (global + per‑org override via `system-settings` / `feature-flags`):
- `BILLING_CREDITS_ENABLED` — master switch for wallet/effort billing.
- `BILLING_CREDITS_SHADOW` — compute but don't enforce/charge.
- `BILLING_PAYG_ENABLED` — metered overage.
- `MODEL_REGISTRY_DB` — read models from DB registry vs hardcoded catalog.
- `BYOK_DISABLED` — hide user key entry (Enterprise exempt).

Sequence: (1) ship schema + registry seed dormant → (2) registry DB read‑through (no billing
change) → (3) credits shadow mode → (4) compute metering shadow → (5) enforce credits on new orgs
→ (6) enable PAYG → (7) backfill/migrate existing subs to new plan keys + Stripe products → (8)
flip new pricing page live. Each step = its own batch, tests, green CI, deploy, verify.

---

## 14. Implementation phases (committable batches)

- **P0 — Foundation (start now):** Prisma migrations (`CreditWallet`, `CreditLedger`,
  `AgentCheckpoint`, `ProviderConfig`, `ModelConfig`, plan intervals) + store methods + unit tests.
  Dormant behind flags. *No runtime behaviour change.*
- **P1 — Plan catalog:** new `starter/core/pro/enterprise` + annual + included credits in
  `packages/billing`, with aliases; tests (`plans.spec.ts`).
- **P2 — Registry read‑through:** seed `ProviderConfig/ModelConfig` from `modelCatalog`; ai‑gateway
  + `api.models.ts` read DB behind `MODEL_REGISTRY_DB`.
- **P3 — Wallet + checkpoint (shadow):** grants, pre‑flight reserve, settle, proof‑of‑work UI;
  shadow mode validates cost vs `AiCostLedger`.
- **P3b — Credit packs + Pro extras:** `CreditPack` (6‑mo expiry, earliest‑first consumption,
  no post‑expiry rollover), monthly‑credit rollover (Pro, 1 month), agent build tiers
  (Lite/Economy/Power) + Turbo mode (2.5×/≤6×) on the checkpoint.
- **P4 — Compute metering (shadow):** runtime minutes in GC + stop/delete, idempotent, at Replit
  CU rates (`compute-pricing.ts`).
- **P4b — Object‑storage metering (NEW):** storage GiB‑month ($0.03), transfer ($0.10/GiB),
  ops (Class A $0.0006/1k, Class B $0.0075/1k).
- **P4c — DB metering (NEW):** active‑hours compute + max‑GiB/month storage.
- **P4d — Deployment metering (NEW):** Autoscale/Scheduled/Static/Reserved‑VM tiers + the
  Starter 30‑day published‑link expiry job; egress allowances (Core 100 GiB).
- **P5 — Admin console:** providers/models/wallets/checkpoints sections + tab re‑mapping (§11).
- **P5b — Spend guard‑rails:** Usage Limit + Service Shutdown Limit + org $500‑increment budgets +
  per‑user limits (Enterprise) + alert delivery.
- **P6 — Pricing page + checkout intervals (monthly/annual toggle + proration).**
- **P7 — Enforce + PAYG + Stripe products (monthly+annual+metered) + migrate subs (real money).**
- **P8 — Legal/security parity (§16.5):** strike system, account‑inactivity GC, data‑deletion
  self‑serve, acceptable‑use/licensing/security policy pages, abuse‑report wiring, public‑app MIT default.

---

## 15. Stripe setup checklist (for Avi) — see also the session summary

> Detailed dashboard + CLI + configmap sequence is maintained in
> **§"Stripe runbook"** below and surfaced in the milestone hand‑off.

### Products & prices to create
1. **Core** product → monthly price **$25** + annual price **$240** (eff $20/mo).
2. **Pro** product → monthly price **$100** + annual price **$1140** (eff $95/mo).
3. **Starter** — no paid price (free); optional $0 product for completeness.
4. **Enterprise** — no self‑serve price (custom invoicing).
5. **Pay‑as‑you‑go AI** — a **metered** recurring price (usage‑based, per‑credit or per‑1k‑credits).
6. **Pay‑as‑you‑go Compute** — a **metered** recurring price (per runtime‑minute or per‑credit).
7. (Optional, Replit‑style "credit grant") use Stripe **Billing Credits / customer balance** or
   model grants internally in the wallet (recommended: wallet internal, Stripe only for money in).

### Webhooks to add (beyond the current 7)
`invoice.created`, `invoice.upcoming`, and if adopting Stripe Meters:
`billing.meter.*` / usage‑record events. Keep existing
`checkout.session.completed`, `customer.subscription.*`, `invoice.{paid,payment_failed,finalized}`.

### Config wiring (configmap + secrets)
New env: `STRIPE_CORE_PRICE_MONTHLY_ID`, `STRIPE_CORE_PRICE_ANNUAL_ID`,
`STRIPE_PRO_PRICE_MONTHLY_ID`, `STRIPE_PRO_PRICE_ANNUAL_ID`,
`STRIPE_PAYG_AI_PRICE_ID`, `STRIPE_PAYG_COMPUTE_PRICE_ID`, `AI_MARGIN`,
plus product IDs. Secrets unchanged (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`) — **rotate the
live secret key** when going live.

### Exact sequence
1. Dashboard → Products → create Core/Pro (+ metered PAYG) → copy price IDs.
2. `stripe listen` / configure webhook endpoint `https://app.e-code.ai/billing/stripe/webhook`,
   add the new events, copy the signing secret.
3. Put price IDs in `infra/helm/platform/values-prod.yaml` configmap; secrets in Secret Manager.
4. `helm upgrade` (CD), verify `seedBillingPlans` picked up the IDs (`/admin/billing`).
5. Backfill: migrate existing `pro/team` subs to `core/pro` (script) once products exist.
6. Flip `BILLING_CREDITS_ENABLED` per‑org (canary), then global.

---

## 16. Replit parity checklist (point‑by‑point)

Verified against **replit.com/pricing** and **replit.com/blog/effort-based-pricing**
(fetched 2026‑06‑16). Legend: ✅ done · 🔶 partial/dormant · ⬜ todo.

### 16.1 Pricing page — plans & entitlements

| Replit element | Target value | Status | Where |
|---|---|---|---|
| Starter (Free) | $0, free daily Agent credits | ✅ catalog · 🔶 grant wiring | `creditPlanCatalog.starter`, `planCreditConfig.starter` (daily 25¢, **amount not published by Replit — confirm with Avi**) |
| Starter: built‑in DB | yes | ⬜ | no per‑project DB yet (spec §8) |
| Starter: publish 1 project | 1 | 🔶 | entitlement encoded; enforcement P5 |
| Starter: private/password deploys | yes | 🔶 | exists in deploy flow; gate P5 |
| Core monthly | $25/mo | ✅ | `monthlyCents: 2500` |
| Core annual | $20/mo ($240/yr, 20% off) | ✅ | `annualCents: 24000`, `annualMonthlyCents: 2000` |
| Core: $25 monthly credits | $25 | ✅ | `includedCreditCents: 2500` |
| Core: up to 5 collaborators | 5 | ✅ | `collaborators: 5` |
| Core: up to 2 parallel agents | 2 | ✅ catalog · ⬜ enforce | `parallelAgents: 2`; gate in agent fan‑out P3/P5 |
| Core: unlimited workspaces | ∞ | ✅ | `limits.workspaces.active = 1_000_000` |
| Core: remove "Made with" badge | yes | ✅ catalog · ⬜ UI | `badgeRemovable: true`; badge component P5/P6 |
| Core: publish any region | all | ✅ catalog · ⬜ enforce | `publishRegions: 'all'` |
| Core: AI integrations | yes | ✅ | feature bullet |
| Pro monthly | $100/mo | ✅ | `monthlyCents: 10000` |
| Pro annual | $95/mo ($1140/yr, 5% off) | ✅ | `annualCents: 114000`, `annualMonthlyCents: 9500` |
| Pro: $100 monthly credits | $100 | ✅ | `includedCreditCents: 10000` |
| Pro: up to 15 collaborators | 15 | ✅ | `collaborators: 15` |
| Pro: up to 50 viewers | 50 | ✅ catalog · ⬜ enforce | `viewers: 50` |
| Pro: up to 10 parallel agents | 10 | ✅ catalog · ⬜ enforce | `parallelAgents: 10` |
| Pro: most powerful models | yes | ✅ catalog · 🔶 registry | `topModels: true`; gated via `ModelConfig.enabledPlans` |
| Pro: 28‑day DB rollbacks | 28 | ✅ catalog · ⬜ feature | `dbRollbackDays: 28`; DB rollback feature P‑later |
| Pro: premium support | yes | ✅ | feature bullet |
| Enterprise: custom seats, SSO/SAML | yes | ✅ catalog · 🔶 SSO exists | `enterprise` features; SSO/SAML already in code |
| Enterprise: single‑tenant, region select, static egress IPs, VPC peering, data warehouse, design system, groups, dedicated support | yes | ✅ catalog · ⬜ infra | feature bullets; infra items operator‑side |
| **Monthly AND annual** billing, distinct price IDs | both | ✅ schema · ⬜ checkout/proration | `Plan.stripePrice{Monthly,Annual}Id`, `stripePrice{Monthly,Annual}Env`; checkout interval + proration P6/P7 |
| Annual/monthly toggle on pricing page | yes | ⬜ | pricing page rebuild P6 |

### 16.2 Effort‑based pricing (blog)

| Replit element | Target | Status | Where |
|---|---|---|---|
| Exactly **1 checkpoint per Agent request** | 1 | ✅ model · 🔶 wiring | `AgentCheckpoint` (one row/request); settle wiring P3 |
| **No intermediate checkpoints** | bundled | ✅ | one create→complete per request, costs bundled at settle |
| Cost = real effort (time + compute) | dynamic | ✅ math · 🔶 wiring | `AgentCheckpoint.{wallMs,computeCents,rawProviderCents}` → `computeCreditCostCents` |
| Simple < $0.25, complex more (no flat fee) | dynamic | ✅ | no flat per‑checkpoint price; derived from tokens+compute |
| **High power model** per‑request control | toggle | ✅ math/schema · ⬜ UI+routing | `AgentCheckpoint.highPowerModel`, `estimateCheckpointCostCents` ×4; route to `isHighPower` model P3 |
| **Extended thinking** per‑request control | toggle | ✅ math/schema · ⬜ UI+plumb | `AgentCheckpoint.extendedThinking`, ×2.5; reasoning‑budget plumb P3 |
| These controls cost more credits | yes | ✅ | estimate multipliers in `credits.ts` |
| **Proof‑of‑work** cost shown in Agent UI | display | ⬜ | settle returns `creditCents` + breakdown; agent panel UI P3 |
| Credits consumed from balance | yes | ✅ store · 🔶 wiring | `recordCreditEntry(CONSUMPTION)`; chat‑flow settle P3 |

### 16.3 Beyond the two pages (supporting parity)

| Element | Status | Where |
|---|---|---|
| Pay‑as‑you‑go overage past included credits | 🔶 | `evaluateCreditGate` PAYG mode; Stripe metered P7 |
| Spend/budget cap + alerts (Replit "Usage Limit") | ✅ math · ⬜ UI | `CreditWallet.budgetCapCents`, `paygAlertThresholdCrossed`; admin/user UI P5 |
| Compute billing (runtime/deploys) at Replit CU rates | ⬜ | metering P4 (1 CPU‑s=18 CU, 1 GB‑s=2 CU; Autoscale $1+$3.20/M CU+$1.20/M req) |
| Admin‑owned keys + global model registry | ✅ store · ⬜ read‑through | `ProviderConfig`/`ModelConfig`; ai‑gateway + api.models P2b |
| BYOK Enterprise‑only | ⬜ | hide key entry; `byokAllowed` P5 |

### 16.4 Billing docs (deep) — exact rules to reproduce

Sources: docs.replit.com/billing/{ai-billing, deployment-pricing, object-storage-billing,
about-usage-based-billing, managing-spend, plans/*} (fetched 2026‑06‑16).

**AI billing (ai-billing):**
| Rule | Status | Note |
|---|---|---|
| **Every** Agent interaction is billable — even text‑only / Plan‑Mode answers with no code change | ⬜ | settle a checkpoint even when no diff is produced (P3) |
| One checkpoint/request, no intermediate | ✅ | `AgentCheckpoint` |
| Credits cover Agent **and** published apps, storage, databases | 🔶 | wallet debits must span AI + compute + storage + DB (P3/P4) |

**Deployment pricing (deployment-pricing) — exact, reproduce in P4 metering:**
| Tier | Rate | Status |
|---|---|---|
| Autoscale | base **$1.00/mo** + **$3.20 / M compute units** + **$1.20 / M requests** | ⬜ |
| Scheduled | base **$1.00/mo** + **$3.20 / M compute units** + scheduler $0 | ⬜ |
| Static | hosting free + **$0.10 / GiB** egress | ⬜ |
| Reserved VM 0.5 vCPU/2 GB (shared) | **$20.00/mo** | ⬜ |
| Reserved VM 1 vCPU/4 GB | **$40.00/mo** | ⬜ |
| Reserved VM 2 vCPU/8 GB | **$80.00/mo** | ⬜ |
| Reserved VM 4 vCPU/16 GB | **$160.00/mo** | ⬜ |
| Compute‑unit conversion | **1 CPU‑s = 18 CU**, **1 GB‑s = 2 CU** | ✅ constants (`compute-pricing.ts`) |

**Object storage (object-storage-billing) — NEW metering (P4b):**
| Item | Rate | Status |
|---|---|---|
| Storage | **$0.03 / GiB‑month** (min 7‑day billing per object) | ✅ constants · ⬜ metering |
| Data transfer (up+down) | **$0.10 / GiB** | ✅ constants · ⬜ metering |
| Basic ops (Class A) | **$0.0006 / 1k requests** | ✅ constants · ⬜ metering |
| Advanced ops (Class B) | **$0.0075 / 1k requests** | ✅ constants · ⬜ metering |

**Usage‑based billing (about-usage-based-billing):**
| Rule | Status | Note |
|---|---|---|
| Monthly allowances: egress (**Core 100 GiB**), compute units, requests | ⬜ | per‑plan allowances (P1b catalog + P4 metering) |
| Only **egress** counts toward data allowance | ⬜ | metering rule |
| Overage → pay‑as‑you‑go after allowance | 🔶 | `evaluateCreditGate` + Stripe metered P7 |
| **Credit packs** purchasable, **expire 6 months**, **earliest‑expiring used first**, no rollover after expiry | ⬜ | new `CreditPack` model + consumption ordering (P3b) |
| DB compute billed by **active hours**; DB storage by **max GiB/month** | ⬜ | DB metering (P4c) |

**Managing spend (managing-spend) — spend guard‑rails (P5b):**
| Rule | Status | Note |
|---|---|---|
| **Usage Limit** (caps spend past credits) | ✅ schema (`budgetCapCents`) · ⬜ UI/enforce | block usage‑based services at next cycle or until raised |
| **Service Shutdown Limit** (suspend services) | ⬜ | new wallet field `serviceShutdownCents` |
| Org budgets in **$500 increments**, admin/owner only | ⬜ | validation + admin UI |
| **Per‑user spend limits** (Enterprise), override group/workspace defaults | ⬜ | new model (P5b) |
| "$0.01 to restrict to credits" | ✅ | falls out of `evaluateCreditGate` |
| Alerts on threshold crossing | ✅ math (`paygAlertThresholdCrossed`) · ⬜ delivery | notifications P5b |

**Plans (deep, plans/*):**
| Rule | Status | Note |
|---|---|---|
| Starter: **daily** Agent credits up to monthly cap, reset daily; monthly cloud credits | ✅ daily · 🔶 monthly‑cap | `planCreditConfig.starter` + cap (P1b) |
| Starter: **2 GB** workspace storage, **1** free published app, **published links expire after 30 days** | ⬜ | catalog + publish expiry job (P4d) |
| Starter: Lite build only; Full build/Plan Mode/connectors/AI integrations gated to Core | ⬜ | feature gating (P5) |
| Core: **1 active task at a time**; Full build (Economy/Power); unlimited apps | 🔶 | `parallelAgents:2`; build tiers (P3) |
| Pro: 15 builders **pooled credits + budget controls**; **10** parallel; **Turbo mode 2.5× faster / up to 6× cost**; credits **roll over 1 month**; 28‑day DB restore; support <24 h | 🔶 | add Turbo + agent modes + rollover (P3b) |
| Enterprise: SSO/SAML+**SCIM**, RBAC↔IdP groups, **SIEM** audit, **Security Center (CVE)**, **SBOM**, admin controls (require private/ban public/mandate scans/pin geos), unlimited seats, **first‑party Databricks/BigQuery/MS Fabric/Hex/Snowflake**, credit‑commitment OR PAYG | 🔶 | many exist (SSO/SCIM/SIEM); data‑warehouse/SBOM new |

**Agent power controls (full set) — extend `AgentCheckpoint` (P3):**
`highPowerModel` ✅, `extendedThinking` ✅, **build tier Lite/Economy/Power** ⬜, **Turbo mode (Pro, 2.5×/≤6×)** ⬜.

### 16.5 Legal / security / usage parity (P8 — pages + mechanisms)

| Replit doc | Requirement | Status | Plan |
|---|---|---|---|
| strike-system-faq | Warnings → **Community Ban** (no post/share, keeps IDE) → **Account Ban** (no login, apps deleted); appeals@ email | ⬜ | strike model + enforcement ladder + appeal route (P8) |
| account-inactivity | Free account inactive **1 year** (no login) → apps deleted/account terminated; **paid exempt** | ⬜ | inactivity GC job + notifications (P8) |
| deleting-your-data | Self‑serve: Settings→Account→Billing→Request deletion→confirm; removes all content + PII, irreversible | ⬜ | data‑deletion self‑serve flow + purge job (P8) |
| security | Vuln disclosure security@; "your code/data protected" | 🔶 | security policy page + disclosure route |
| abuse-report | In‑product report button + abuse@ (phishing); team review | 🔶 (abuse events exist) | wire report button → existing AbuseEvent (P8) |
| usage (acceptable use) | No crypto‑mining; hard limits (CPU/RAM/app, **max 20 concurrent apps**, storage); soft limits (bandwidth); GraphQL/connection caps | 🔶 | acceptable‑use page + enforce concurrent‑app cap |
| licensing-info | Public apps **MIT** default; private apps licensed to platform per ToS; custom license via file | ⬜ | licensing page + public‑app MIT default |

---

## Appendix — key file references
- Plans/quotas: `packages/billing/src/index.ts`
- AI pricing: `packages/billing/src/ai-pricing.ts`
- Prisma: `packages/database/prisma/schema.prisma`
- Quota/Stripe/webhooks: `services/api/src/app.ts` (`9409‑9625`, `15976‑16742`)
- AI gateway: `services/ai-gateway/src/gateway.ts`, `agent-executor.ts`
- Frontend AI usage: `app/lib/.server/ai-usage.ts`, `app/routes/api.models.ts`
- Settings registry: `app/components/@settings/core/{constants.tsx,ControlPanel.tsx}`
- Admin: `app/routes/admin.$section.tsx`, `admin.billing.tsx`
- Dashboard: `app/routes/dashboard.tsx`, `app/components/dashboard/SaaSLayout.tsx`
- Compute lifecycle: `services/workspace-manager/src/manager.ts`, `services/worker/src/index.ts`
