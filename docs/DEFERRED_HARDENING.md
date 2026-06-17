# Deferred Hardening — dedicated chantiers + supervised ops

> Items that are **not** safe to land as an autonomous in-stream change because they either
> require a multi-week framework migration or a high-impact, hard-to-reverse cluster operation.
> Each is scoped here with an exact plan so it can be picked up deliberately.

---

## 1. `turbo-stream` security advisory → React Router 7 migration (DEDICATED CHANTIER)

**Why it's here:** the only way to drop `turbo-stream` (the last open security advisory) is to move the
web app off Remix single-fetch onto **React Router 7**. Assessment of *this* repo:

- **Versions:** `@remix-run/{node,react,serve,dev}` 2.17.x + `@remix-run/cloudflare(-pages)` 2.15.x;
  `react-router` 6.30.2 pinned (override). `turbo-stream@2.4.1` is a **transitive** dep via
  `@remix-run/server-runtime` and `@remix-run/react`.
- **Single-fetch is ON** (`vite.config.ts` `future.v3_singleFetch: true`) — turbo-stream is the SSR
  hydration wire format, so it runs through the whole render path. Remix-v2 and RR7 routes **cannot
  coexist**; this is an atomic cutover, not an incremental file-by-file change.
- **Scale:** ~297 route files, ~248 loader/action exports, ~526 `redirect()`/`json()` call sites,
  200+ `meta` functions, 133 `useLoaderData/useFetcher` calls.
- **Repo-specific landmines:** (a) the single-fetch redirect gotcha (`enterprise-api.server.ts` throws
  framework `redirect()`); (b) SSR `process.env` shim via `vite-plugin-node-polyfills`
  (`globalThis.process.env` workaround must survive); (c) `@remix-run/cloudflare` context + `remix-island`
  `renderHeadToString` have no 1:1 RR7 equivalent.

**Verdict:** a realistic **~6–8 week dedicated migration** with feature-freeze, not an autonomous patch.
Attempting it mid-stream would risk prod. **Flagged as a dedicated chantier.**

### Migration plan (stages, each gated by green tests + e2e)
1. **Prep (≈1 wk):** audit all 297 routes (loader/action sigs, `context.cloudflare` usage, meta shape,
   redirect patterns); decide runtime (**stay Cloudflare-Pages adapter** vs move to Node `@remix-run/serve`
   replacement); build a turbo-stream-free SSR test harness; create a parallel `vite-rr7.config.ts` +
   `entry.{server,client}.rr7.tsx` without deleting the Remix path.
2. **Core infra (≈2–3 wk):** swap `remixVitePlugin` → `@react-router/dev` vite plugin (drop
   `v3_singleFetch`); rewrite `entry.server.tsx` (remove turbo-stream serialization + `remix-island`,
   keep the `globalThis.process.env` shim + CSP); rewrite `entry.client.tsx` (`RemixBrowser` → RR7
   hydration); add a `rr7-compat` shim (`json`/`redirect` from `react-router`, reuse `readEnv`).
3. **Routes (≈3–4 wk):** migrate in batches — leaf/no-data → simple loaders → actions → **redirects/error
   boundaries** (highest risk: single-fetch redirect symbols) → `context.cloudflare` routes. `pnpm test`
   + `pnpm build` after each batch.
4. **Cleanup (≈1 wk):** remove `@remix-run/*`, confirm `pnpm why turbo-stream` is empty + `pnpm audit`
   clean, delete legacy entry files.
5. **Rollout:** staging → canary (5%→25%→100%) with a Remix-v2 rollback image kept for 1 week. Re-verify
   the core e2e (login, create project, chat/stream, deploy, billing).

**Interim mitigation if the advisory must be silenced sooner:** bump `@remix-run/*` to the latest 2.x in
case a patched `turbo-stream` is published upstream (the CI audit gate is advisory, not deploy-blocking).

---

## 2. #26 — OAuth scope tightening + Kyverno admission (SUPERVISED OPS)

**Done / safe-to-do autonomously:** application-level OAuth hardening already landed in prior waves
(signed-state CSRF, account-takeover fix, provider URL defaults). Egress/NetworkPolicy + per-service SA
automount lockdown are chart-managed and already applied.

**Requires a supervised, high-impact cluster operation (NOT autonomous — can break prod):**

### 2a. GKE node-pool OAuth scope reduction
The node pool was created with broad `oauthScopes` (e.g. `cloud-platform`). Narrowing scopes is
**immutable on an existing node pool** — it requires **creating a new node pool with reduced scopes and
draining/cordoning the old one** (a supervised blue-green pool recreate). The classifier also blocks the
in-place attempt.
- **Procedure (supervised):**
  1. `gcloud container node-pools create <new-pool> --cluster <c> --location <l> --scopes=<minimal set:
     logging-write,monitoring,storage-ro,service-control,service-management,trace> --workload-metadata=GKE_METADATA`
     (rely on **Workload Identity**, not node scopes, for app GCP access).
  2. Cordon + drain the old pool (`kubectl cordon` / `kubectl drain --ignore-daemonsets --delete-emptydir-data`),
     verify all workloads reschedule healthy.
  3. `gcloud container node-pools delete <old-pool>`.
  - **Risk:** full workload reschedule; do in a maintenance window with the team watching. Validate
    Workload Identity bindings first so pods keep their GCP access after scopes drop.

### 2b. Kyverno (or Gatekeeper) admission controller
Installing a policy admission webhook is a cluster-wide control-plane change that can **reject pod
admission fleet-wide** if a policy is mis-scoped.
- **Procedure (supervised):**
  1. Install Kyverno via Helm in **`Audit`** mode first (`validationFailureAction: Audit`).
  2. Author baseline policies (disallow `:latest` on prod, require `runAsNonRoot`, restrict capabilities,
     require resource limits, restrict hostPath) — mirror what podSecurity already enforces.
  3. Run in Audit for ≥1 week, review the policy report, fix any flagged workloads.
  4. Flip critical policies to **`Enforce`** one at a time, watching admission for rejections.
  - **Risk:** an over-broad `Enforce` policy blocks deploys/scale-ups. Always stage Audit→Enforce.

*Both 2a and 2b need an operator at the console with rollback ready; documented here so they're not lost.*

*Authored 2026-06-17.*
