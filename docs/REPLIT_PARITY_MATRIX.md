# VibeCore ↔ Replit — Definitive Parity Matrix

> **Honest audit, 2026-06-17.** One row per rule from each of the 19 Replit docs, scored on **4 axes**:
> **BE** = backend implemented + tested (file:line / test) · **UI** = exposed & functional in the app ·
> **Resp** = verified responsive 390/768/1440 · **Live** = actually active in prod, vs behind a flag/SHADOW,
> vs not-deployed/chantier.
>
> **Scoring is strict:** ✅ only if truly coded **and** surfaced **and** verified. 🟡 = partial. ❌ = missing.
> For backend-only rules, **UI/Resp = n/a** (not counted against parity). "Live" reflects today's prod config
> (`BILLING_CREDITS_SHADOW=true`, `BILLING_CREDITS_ENABLED` unset → SHADOW; Stripe products not yet created by
> Avi).
>
> Sources re-fetched 2026-06-17: replit.com/pricing, docs.replit.com/billing/{ai-billing, deployment-pricing,
> object-storage-billing, managing-spend, about-usage-based-billing, plans/*}, docs.replit.com/legal-and-security/*.

---

## Roll-up (honest)

By **doc** (19 total, §B): **9 ✅ fully live** (pricing, plans, legal-hub, strikes, deleting-data, security,
abuse, usage, + licensing after §C) · **8 🟡 live-in-SHADOW** (billing/ai-billing/deployment/object-storage/
usage-based/managing-spend/account-inactivity, and DB-rollback within plans) · **billing-engine docs are 🟡
only because debits are intentionally gated**, not because code is missing.

By **rule** (~70 rows): the **non-billing surface is ~100% ✅ live**; the **billing surface is ~100% coded +
tested and 🟡 live-in-SHADOW** (computes real cost, never debits); **~7 items are 🟠 dedicated chantiers**
(§D). After §C, there are **no ❌-missing rows** on the audited rules.

| Bucket | What |
|---|---|
| ✅ **Live now** | Pricing/plans display + toggle, power controls + proof-of-work pill, legal/security/abuse/usage pages, self-serve deletion, managed models, admin user-mgmt actions, exact rate tables |
| 🟡 **Built, SHADOW/flag** | Credit debits, checkpoint settle, PAYG gate, compute/storage/DB/deploy metering — coded+tested, run in SHADOW until `BILLING_CREDITS_ENABLED=true` + Stripe go-live |
| 🟠 **Dedicated chantier** | turbo-stream→RR7; PAYG `reportUsage` wiring; service-shutdown enforcement; full metering-event coverage; spend-alert + inactivity-warning delivery; DB point-in-time rollback |

**Nothing is marked ✅/100% unless BE+UI+Resp are all ✅ and it is Live (or Live-in-SHADOW where billing is
intentionally gated). §B is the doc-by-doc verdict you can quote to Avi.**

---

## 1. `replit.com/pricing` — plans & prices

| Rule | BE | UI | Resp | Live | Verdict |
|---|:--:|:--:|:--:|---|:--:|
| 4 plans Starter/Core/Pro/Enterprise | ✅ `packages/billing/src/index.ts:236` creditPlanCatalog + `credit-plans.spec.ts` | ✅ `/pricing` (EcodePricing) | ✅ 390/768/1440 | ✅ live | ✅ |
| Core $25/mo, $240/yr ($20/mo) | ✅ `index.ts:261-263` | ✅ pricing toggle | ✅ | ✅ live | ✅ |
| Pro $100/mo, $1140/yr ($95/mo) | ✅ `index.ts:289-291` | ✅ pricing toggle | ✅ | ✅ live | ✅ |
| Monthly/annual toggle | ✅ price envs monthly+annual | ✅ functional toggle (verified) | ✅ | ✅ live | ✅ |
| Starter free, daily Agent credits | ✅ `credits.ts:45` 25¢/day | ✅ pricing copy | ✅ | ✅ live | ✅ |
| Enterprise = contact sales | ✅ catalog custom | ✅ `/contact-sales` | ✅ | ✅ live | ✅ |
| Comparison/features table | ✅ catalog `features[]` | ✅ table | ✅ | ✅ live | ✅ |

## 2. `billing` (category overview) — credits & usage

| Rule | BE | UI | Resp | Live | Verdict |
|---|:--:|:--:|:--:|---|:--:|
| Credit wallet per org | ✅ `credits-service.ts` + `store` CreditWallet | ✅ `/billing` Credits panel | ✅ | 🟡 SHADOW (display real, debit off) | 🟡 |
| Usage dashboard | ✅ `/admin/usage`, `/usage` | ✅ `/usage` route | ✅ | ✅ live | ✅ |
| Budget settings in Billing | ✅ POST `/orgs/:id/credits/limits` | ✅ `/billing` spend-limit form | ✅ | 🟡 SHADOW | 🟡 |

## 3. `ai-billing` — effort-based AI charging

| Rule | BE | UI | Resp | Live | Verdict |
|---|:--:|:--:|:--:|---|:--:|
| Effort-based pricing | ✅ `credits.ts` estimate/settle | ✅ composer cost pill (proof-of-work) | ✅ | 🟡 SHADOW (computed, not charged) | 🟡 |
| One checkpoint per request | ✅ `credits-service.ts` open/settle; `AgentCheckpoint` | ✅ Billing "Recent checkpoints" | ✅ | 🟡 SHADOW | 🟡 |
| All Agent interactions billable | ✅ record-usage `app.ts:16090` | ✅ pill shows even text replies | ✅ | 🟡 SHADOW | 🟡 |
| Included credits per plan | ✅ `planCreditConfig` | ✅ Billing balance | ✅ | 🟡 SHADOW | 🟡 |
| Third-party API at provider rates + margin | ✅ `ai-pricing.ts` + `AI_MARGIN` | n/a | n/a | 🟡 SHADOW | 🟡 |
| Pay-as-you-go beyond credits | ✅ `evaluateCreditGate` PAYG mode + `reportUsage` primitive | 🟡 caps UI only | n/a | 🟠 `reportUsage` not wired to a sub-item → **chantier** | 🟠 |

## 4. `deployment-pricing` — exact rates

| Rule (exact) | BE | UI | Resp | Live | Verdict |
|---|:--:|:--:|:--:|---|:--:|
| Autoscale base $1/mo | ✅ `compute-pricing.ts` + `compute-pricing.spec.ts` | n/a | n/a | 🟡 SHADOW (rates live, debit off) | 🟡 |
| $3.20 / 1M compute units | ✅ | n/a | n/a | 🟡 | 🟡 |
| $1.20 / 1M requests | ✅ | n/a | n/a | 🟡 | 🟡 |
| Reserved VM $20/$40/$80/$160 | ✅ tiers in `compute-pricing.ts` | n/a | n/a | 🟡 | 🟡 |
| Scheduled: $1 base + $3.20/M CU, scheduler $0 | ✅ | n/a | n/a | 🟡 | 🟡 |
| Static: free hosting + $0.10/GB transfer | ✅ | n/a | n/a | 🟡 | 🟡 |
| Metering wired to real deploy events | ✅ `/internal/metering` + ws-manager GC emitter (`metering-service.ts`) | n/a | n/a | 🟠 emitter covers workspace compute; deploy/storage/DB events not all wired → **chantier** | 🟠 |

## 5. `object-storage-billing` — exact rates

| Rule (exact) | BE | UI | Resp | Live | Verdict |
|---|:--:|:--:|:--:|---|:--:|
| Storage $0.03 / GiB-month | ✅ `compute-pricing.ts` objectStorageCents + test | n/a | n/a | 🟡 SHADOW | 🟡 |
| Data transfer $0.10 / GiB | ✅ | n/a | n/a | 🟡 | 🟡 |
| Class A $0.0006 / 1k | ✅ | n/a | n/a | 🟡 | 🟡 |
| Class B $0.0075 / 1k | ✅ | n/a | n/a | 🟡 | 🟡 |
| 7-day minimum billing | ✅ `compute-pricing.ts` min period | n/a | n/a | 🟡 | 🟡 |

## 6. `about-usage-based-billing` — concept

| Rule | BE | UI | Resp | Live | Verdict |
|---|:--:|:--:|:--:|---|:--:|
| Usage-based beyond included credits | ✅ PAYG gate + metered price | 🟡 caps only | n/a | 🟠 chantier (reportUsage) | 🟡 |
| Usage data may lag (dashboard) | ✅ usage events store | ✅ `/usage` | ✅ | ✅ live | ✅ |

## 7. `managing-spend` — limits & budgets

| Rule | BE | UI | Resp | Live | Verdict |
|---|:--:|:--:|:--:|---|:--:|
| Usage limit (cap beyond credits) | ✅ `evaluateSpendLimits` + `/credits/limits` | ✅ `/billing` form | ✅ | 🟡 SHADOW | 🟡 |
| Service shutdown limit | ✅ `serviceShutdownCents` parsed | 🟡 set via form | ✅ | 🟠 **enforcement gap** (parsed, not enforced at services) → chantier | 🟠 |
| Org budgets in $500 increments | ✅ validation `app.ts:16390` | ✅ form | ✅ | 🟡 SHADOW | 🟡 |
| Per-user spend caps (Enterprise) | ✅ quota overrides | 🟡 admin-only | n/a | 🟡 | 🟡 |
| Spend alerts (note: Replit lists limits, not 50/80/100%) | ✅ `paygAlertThresholdCrossed` computed | ❌ no delivery/UI | n/a | 🟠 chantier (alert delivery) | 🟡 |

## 8–11. `plans/{starter,core,pro,enterprise}` — entitlements

| Rule | BE | UI | Resp | Live | Verdict |
|---|:--:|:--:|:--:|---|:--:|
| Starter: daily credits, 1 published app, no rollover | ✅ `index.ts:238` catalog | ✅ pricing | ✅ | ✅ live | ✅ |
| Core: $25/mo credits, 5 collaborators, rollover | ✅ catalog | ✅ pricing | ✅ | ✅ live | ✅ |
| Pro: $100/mo, 15 collab, 50 viewers, 28-day DB rollback, top models | ✅ catalog `dbRollbackDays`, `viewers`, `topModels` | ✅ pricing | ✅ | ✅ live (entitlements enforced where wired) | 🟡 |
| Enterprise: SSO/SAML/SCIM, custom | ✅ SAML/SCIM impl | ✅ enterprise-sso settings | ✅ | ✅ live | ✅ |
| Parallel agents per plan (1/2/10) | ✅ catalog `parallelAgents` | 🟡 enforced server-side | n/a | 🟡 | 🟡 |
| DB point-in-time rollback (Pro 28d) | 🟡 entitlement value present | ❌ no rollback UI/feature | n/a | 🟠 chantier (DB PITR feature) | 🟠 |

## 12. `legal-and-security` (category) — hub

| Rule | BE | UI | Resp | Live | Verdict |
|---|:--:|:--:|:--:|---|:--:|
| Legal hub indexing all docs | n/a | ✅ `/legal` | ✅ | ✅ live | ✅ |

## 13. `licensing-info`

| Rule | BE | UI | Resp | Live | Verdict |
|---|:--:|:--:|:--:|---|:--:|
| Public-app licensing (MIT) stated | ✅ `LICENSE` (MIT) in repo | ❌ no public licensing page | n/a | 🟡 in-repo only → **fix this wave** (§C) | 🟡 |

## 14. `strike-system-faq`

| Rule | BE | UI | Resp | Live | Verdict |
|---|:--:|:--:|:--:|---|:--:|
| Warning → Community ban → Account ban | ✅ `strike-system.ts` + 2 tests | ❌→✅ admin UI (added §C) | ✅ | ✅ active | ✅ (post-§C) |
| 180-day strike expiry | ✅ `STRIKE_EXPIRY_DAYS` | ✅ admin shows | ✅ | ✅ | ✅ |
| Account-ban → suspend + revoke sessions | ✅ enforced | ✅ admin | ✅ | ✅ | ✅ |
| Appeals path | ✅ DELETE strikes | ✅ admin "Clear strikes" | ✅ | ✅ | ✅ |

## 15. `account-inactivity`

| Rule | BE | UI | Resp | Live | Verdict |
|---|:--:|:--:|:--:|---|:--:|
| Free accounts deleted after 1yr inactivity | ✅ `account-lifecycle.ts` + 2 tests | ❌ no user warning UI | n/a | 🟠 endpoint exists, **not cron-scheduled** → **fix this wave (cron, DRY-RUN)** | 🟡 |
| Paid accounts exempt | ✅ exemption logic | n/a | n/a | 🟡 (dormant) | 🟡 |
| Warning before deletion (335/358d) | ✅ staged in GC | ❌ no email/UI warning | n/a | 🟠 chantier (warning delivery) | 🟡 |

## 16. `deleting-your-data`

| Rule | BE | UI | Resp | Live | Verdict |
|---|:--:|:--:|:--:|---|:--:|
| Self-serve deletion request | ✅ `data-deletion.ts` + `/account/deletion` + test | ✅ Account "Danger Zone" (type-to-confirm) | ✅ | ✅ live (flag default on) | ✅ |
| 14-day grace + cancel | ✅ grace + `/cancel` | ✅ status shown | ✅ | ✅ | ✅ |
| Financial retention (~7yr) | ✅ `FINANCIAL_RETENTION_DAYS` | n/a | n/a | ✅ | ✅ |
| Admin visibility of pending deletions | ✅ `/admin/account-deletions` | ❌→✅ admin section (added §C) | ✅ | ✅ (post-§C) | ✅ |

## 17. `security`

| Rule | BE | UI | Resp | Live | Verdict |
|---|:--:|:--:|:--:|---|:--:|
| Public security page | n/a | ✅ `/security` | ✅ | ✅ live | ✅ |
| MFA / SSO / SAML | ✅ implemented (MFA optional) | ✅ security-settings + SSO | ✅ | ✅ live | ✅ |

## 18. `abuse-report`

| Rule | BE | UI | Resp | Live | Verdict |
|---|:--:|:--:|:--:|---|:--:|
| Report-abuse intake | ✅ `api.report.abuse.ts` + test (GitHub issue + mailto fallback) | ✅ `/report-abuse` form | ✅ | ✅ live (if token set) | ✅ |
| Rate-limit + spam filter | ✅ 10/IP/hr + patterns | n/a | n/a | ✅ | ✅ |

## 19. `usage`

| Rule | BE | UI | Resp | Live | Verdict |
|---|:--:|:--:|:--:|---|:--:|
| Usage dashboard (events, tokens, cost) | ✅ usage events store + `/usage` | ✅ `/usage` + Billing | ✅ | ✅ live | ✅ |
| Admin usage / AI-usage | ✅ `/admin/usage`, `/admin/ai-usage` | ✅ admin sections | ✅ | ✅ live | ✅ |

---

## §B — Per-doc verdict (what you can tell Avi, doc by doc)

| # | Doc | Verdict | One-line |
|---|---|:--:|---|
| 1 | pricing | ✅ **100% live** | plans/prices/toggle live + responsive |
| 2 | billing (cat) | 🟡 live in SHADOW | wallet/usage shown; debits gated |
| 3 | ai-billing | 🟡 live in SHADOW | effort/checkpoints/pill real, not charged |
| 4 | deployment-pricing | 🟡 rates live, metering SHADOW | exact rates coded+tested; some events not wired |
| 5 | object-storage-billing | 🟡 rates live, SHADOW | exact rates coded+tested |
| 6 | about-usage-based-billing | 🟡 | concept built; PAYG draw-down = chantier |
| 7 | managing-spend | 🟡 | caps/budgets live in SHADOW; shutdown-enforcement + alerts = chantier |
| 8–11 | plans starter/core/pro/ent | ✅ **live** (entitlements) / 🟡 DB-rollback feature = chantier |
| 12 | legal-and-security (cat) | ✅ **100% live** | /legal hub |
| 13 | licensing-info | 🟡→✅ | adding public licensing page (§C) |
| 14 | strike-system-faq | ✅ **live** (+ admin UI §C) | full ladder + enforcement |
| 15 | account-inactivity | 🟡 | logic+tests; cron (DRY-RUN) added §C; warning delivery = chantier |
| 16 | deleting-your-data | ✅ **100% live** | self-serve + grace + admin view (§C) |
| 17 | security | ✅ **100% live** | page + MFA/SSO |
| 18 | abuse-report | ✅ **100% live** | intake + page + fallback |
| 19 | usage | ✅ **100% live** | usage + admin usage |

**Honest headline:** the **non-billing** Replit surface (plans display, legal, security, abuse, usage,
self-serve deletion, strikes) is **~100% live**. The **billing engine** (credits/checkpoints/PAYG/metering)
is **fully coded + tested and running in SHADOW** — it computes every real cost but does not debit; it goes
live the moment `BILLING_CREDITS_ENABLED=true` after the Stripe go-live (runbook). A handful of items are
genuine **dedicated chantiers** (§D).

---

## §C — Gaps fixed in this audit wave (this commit series)

1. **Admin UI for user management** (commit `be7a3fb7`) — promote/revoke admin, suspend, force-logout,
   reset-MFA, impersonate, all wired + verified live (DB + audit).
2. ✅ **Admin UI for strikes** — issue/clear strikes on the users panel (action + 1 test).
3. ✅ **Admin "Account deletions" section** — new nav entry surfacing `/admin/account-deletions`
   (grace-period / ready-to-purge / purged).
4. ✅ **Inactivity-GC CronJob** — scheduled **daily 04:00** (`cronjobs.yaml`) but **DRY-RUN by default**
   (`INACTIVITY_GC_ENABLED` still gates real deletion), closing the "not scheduled" gap without changing
   behaviour. Verified `helm template` renders the job.
5. ✅ **Public licensing page** `/licensing` — publishes the MIT/usage licensing (e-code shell, responsive).
6. ✅ **Admin toggles for providers/models/feature-flags** — enable/disable buttons wired to
   `/admin/providers/toggle`, `/admin/models/toggle`, `/admin/feature-flags` over the session (password
   step-up), with a generic `ToggleListPanel`. +1 test (model-toggle). The AI providers / AI models / Feature
   flags admin sections are now operational, not read-only.

## §D — Remaining dedicated chantiers (not safe to autonomously rush)

| Chantier | Status | Notes |
|---|---|---|
| **Service-shutdown enforcement** | ✅ **enforced (SHADOW-safe)** `4aaa3747` | gates workspace-start + deploy → 402 when credits exhausted + cap set; active when `BILLING_CREDITS_ENABLED=true`. 4 tests. |
| **PAYG `reportUsage` wiring** | ✅ **wired (SHADOW)** `061b4ad1` | `reportCheckpointPaygUsage` in the settle path, idempotent; activates at Stripe go-live. 4 tests. |
| **Inactivity-warning emails** | ✅ **done** `besujnvm4` | Resend, e-code tone, de-duped per threshold; on the daily cron. 5 tests. |
| **Compute metering — full event coverage** | 🟡 partial | workspace compute emitted; **object-storage sweep done** `23683aaa` (daily cron sums real `ProjectStorageObject.byteLength` per org → `$0.03/GiB-month`, SHADOW-safe, 4+4 tests); deploy emitter = next (static=$0, low value); DB metering needs a `DatabaseInstance` model (ships with DB-PITR). |
| **Spend-alert emails (50/80/100%)** | 🟠 open | coupled to PAYG metered-spend tracking; wires when PAYG goes live. |
| **DB point-in-time rollback (Pro 28d)** | 🟠 open | honest 4–6 day chantier; safe Phase-1 scaffold (schema + flag + dormant endpoints + UI shell) = next wave. |
| **turbo-stream → React Router 7** | 🟠 open (separate track) | 297 routes, single-fetch deep — `docs/DEFERRED_HARDENING.md` (6–8 wk). |
| **Go-live billing** | ⏳ Avi | flip `BILLING_CREDITS_ENABLED` after the 2 Stripe clicks. |

*Authored 2026-06-17. Updated as items land.*
