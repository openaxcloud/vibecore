# MCP servers + stack reality

This file does two jobs at once:

  1. Document the **production stack** so Claude Code never gets confused
     again about where vibecore actually runs.
  2. List which MCP servers are wired, which need authentication, which are
     opt-in, and which were removed.

---

## 1. Stack reality

### Production = GKE on Google Cloud Platform

Authoritative sources in this repo:

| Path | Role |
|---|---|
| `infra/gcp/bootstrap.sh` | Enables every required GCP API on the project: Artifact Registry, GKE, Cloud SQL, Memorystore Redis, GCS, Secret Manager, KMS, Cloud DNS, Cloud Logging, Cloud Monitoring, IAM, ServiceNetworking, CloudBuild. Provisions the `vibecore-terraform` service account. |
| `infra/helm/platform/` | Helm chart for the application services running on GKE: `web`, `admin`, `api`, `worker`, `aiGateway`, `workspaceManager`, `previewProxy`. Wired to nginx ingress, cert-manager DNS-01 LE, Workload Identity. |
| `infra/helm/workspaces-runtime/` | Separate Helm chart for the **user-project sandbox** using gVisor RuntimeClass — this is what isolates the projects vibecore users create. |
| `infra/kubernetes/` | Raw manifests (PodSecurity namespaces, network policies, admission policies, resource quotas, limit ranges). |
| `infra/terraform/` | The IaC. |
| `.github/workflows/docker.yml` | Builds every service image (`Dockerfile` for `web`; `infra/docker/node-service.Dockerfile` for `admin`/`api`/`worker`/`aiGateway`/`workspaceManager`/`previewProxy`; `services/workspace-agent/Dockerfile` for the agent that runs in user pods), pushes to `${GAR_LOCATION}-docker.pkg.dev/${GCP_PROJECT_ID}/${GAR_REPOSITORY}/${image}`. Triggered by `push: tags: ['v*']`. |
| `.github/workflows/deploy-prod.yml` | Manual gated deploy. `workflow_dispatch` requires an `image_tag`, a `staging_runtime_run_id`, and the literal string `READY` typed in. Runs `helm upgrade --install vibecore infra/helm/platform --set global.imageTag=…`. |

Active GCP project: **`vibecore-495216`**.
Active GCP account: **`groupequaliwatt@gmail.com`**.
GKE clusters (`europe-west9` = Paris):

  - `vibecore-prod-app` — runs the `platform` chart.
  - `vibecore-prod-workspaces` — runs the `workspaces-runtime` chart.

### Local dev = Docker compose + pnpm dev

`docker-compose.dev.yml` boots the local services the app needs:

  - **PostgreSQL** with `pgvector/pgvector:pg16` (the prod DB is Cloud SQL,
    same Postgres + pgvector).
  - **Redis 7** (prod uses Memorystore).
  - **Mailpit** for outbound email capture during dev.

Application code itself runs via `pnpm run dev` → Vite + Remix. There is also
a `docker-compose.yaml` with `app-prod` / `app-dev` targets — those are for
Coolify-style self-hosting, **not** the GKE path.

### The Cloudflare bits are vestigial Bolt.diy leftovers

Vibecore forked from Bolt.diy, which was designed for Cloudflare Pages. These
files remain in the tree but **do not run in production**:

  - `wrangler.toml` — references `bolt` Pages project, `pages_build_output_dir`.
  - `package.json` scripts: `deploy`, `start:windows`, `start:unix`,
    `dockerstart`, `typegen` (all call `wrangler`).
  - dev-deps: `@remix-run/cloudflare`, `@remix-run/cloudflare-pages`,
    `@cloudflare/workers-types`, `wrangler`.
  - `vite.config.ts` `cloudflareDevProxyVitePlugin` — only used in `pnpm dev`.
  - `app/lib/enterprise-api.server.ts` and route loaders read
    `context.cloudflare.env` — works locally because of the Vite plugin,
    not used by the Node runtime inside the GKE pods.

A clean-up commit would replace `@remix-run/cloudflare` with
`@remix-run/node`, swap `context.cloudflare.env` for the equivalent process
env (Workload Identity injects secrets), strip wrangler and the Vite plugin.
Not blocking — the current setup builds and runs because the Cloudflare bits
only fire when `wrangler pages deploy` runs, which `deploy-prod.yml` never
invokes.

---

## 2. Common mistakes to avoid

If a future Claude Code session is about to:

  - **Recommend the Cloudflare Developer Platform MCP**: stop. Vibecore
    prod runs on GKE/GCP, not Cloudflare. The Cloudflare MCP can stay
    authenticated for the user's *other* projects but is useless here.

  - **Edit `wrangler.toml` or any `wrangler pages` script**: stop. None of
    those run in the deploy path. Modifying them changes nothing prod-side.

  - **Add Cloudflare Workers KV / R2 / D1 bindings**: stop. The prod uses
    Cloud SQL (Postgres + pgvector), Memorystore Redis, GCS, KMS, Secret
    Manager. None of those map to Cloudflare primitives.

  - **Assume `context.cloudflare.env` works in prod**: only the Vite local
    proxy fills it in. In the GKE pod, env comes from the Node runtime
    (Workload Identity + Secret Manager + `process.env`).

  - **Recommend Cloudflare Workers Logpush for vibecore observability**:
    use Cloud Logging instead. The pod logs land there.

---

## 3. Installed MCP servers (auto-active)

Registered in **`~/.claude.json` top-level `mcpServers`**. Loaded by every
Claude Code session at user level — no per-project trust dialog.

### `playwright` (stdio)

```json
"playwright": {
  "type": "stdio",
  "command": "npx",
  "args": ["-y", "@playwright/mcp@latest"]
}
```

Visual validation of CSS / UI changes at any viewport (1446 / 800 / 500 px),
screenshots, accessibility snapshots, real Chromium. Bundled chromium binaries
already cached at `~/Library/Caches/ms-playwright/`.

### `kubernetes` (stdio)

```json
"kubernetes": {
  "type": "stdio",
  "command": "npx",
  "args": ["-y", "kubernetes-mcp-server@latest"]
}
```

Provides `pods_list`, `pods_log`, `pods_exec`, `resources_get`,
`resources_list`, `helm_install`, etc. Reads the current kubectl context.

**Prerequisites already wired on this machine:**

  - `gcloud` CLI (homebrew) — authenticated as `groupequaliwatt@gmail.com`
    on project `vibecore-495216`. The account holds `roles/owner` on the
    project.
  - `kubectl` CLI.
  - `gke-gcloud-auth-plugin` — installed via
    `gcloud components install gke-gcloud-auth-plugin` and symlinked into
    `/opt/homebrew/bin/`.
  - **Connect Gateway** is the path that makes `kubectl` work from this
    Mac. Both clusters are GKE-private with `privateEndpointEnforcementEnabled`,
    so the public master endpoint is firewall-blocked. Connect Gateway
    routes `kubectl` through a Google-managed proxy authenticated with IAM
    — no VPN, no authorized-network exception, no bastion.

    One-time setup (already done):

    ```sh
    gcloud services enable gkehub.googleapis.com connectgateway.googleapis.com
    gcloud container fleet memberships register vibecore-prod-app \
      --gke-cluster=europe-west9/vibecore-prod-app --enable-workload-identity
    gcloud container fleet memberships register vibecore-prod-workspaces \
      --gke-cluster=europe-west9/vibecore-prod-workspaces --enable-workload-identity
    gcloud projects add-iam-policy-binding vibecore-495216 \
      --member=user:groupequaliwatt@gmail.com \
      --role=roles/gkehub.gatewayAdmin
    ```

    Day-to-day kubeconfig refresh (re-run when your gcloud auth token
    expires or you switch clusters):

    ```sh
    gcloud container fleet memberships get-credentials vibecore-prod-app
    # or
    gcloud container fleet memberships get-credentials vibecore-prod-workspaces
    ```

    This sets the current `kubectl` context to
    `connectgateway_vibecore-495216_europe-west9_<cluster>`.

**Cost.** Connect Gateway is free for Standard-tier GKE clusters when used
from inside the same project. Anthos Enterprise tier billing (~$0.10/h per
cluster) only kicks in if you enable Anthos features (Service Mesh, Config
Sync, Policy Controller, …) which we have not enabled.

**Cluster state at the time of setup.** Both clusters were 10 days old and
contained only the GKE-managed namespaces (`default`, `gke-managed-*`,
`gmp-*`, `kube-*`). No application namespace yet — the infrastructure is
provisioned but waiting for the first `v*` tag to fire the docker build +
helm install pipeline. Once vibecore deploys, the kubernetes MCP becomes
useful for tailing the `vibecore` namespace pods.

### `claude.ai Cloudflare Developer Platform`

Currently authenticated in the user's `claude.ai` catalogue, but **disconnect
it** — it's not the right tool for vibecore. See section 4.

---

## 4. User actions still pending

### Disconnect the Cloudflare MCP

I can't disconnect a `claude.ai`-catalogue MCP programmatically. To do it
yourself:

  1. Type `/mcp` in any Claude Code prompt.
  2. Scroll to `claude.ai Cloudflare Developer Platform`.
  3. Pick "Disconnect" (or "Sign out" depending on the version).

The 25 Cloudflare tools (`workers_list`, `d1_databases_list`, `r2_*`, etc.)
will be removed from the deferred-tools list on the next session.

### Restart Claude Code

After the new `mcpServers` entries (`playwright`, `kubernetes`) are present
in `~/.claude.json`, Claude Code needs a fresh session to pick them up.
Quit + relaunch, then run `/mcp` to verify both show as **connected**.

---

## 5. Opt-in MCPs (you provide credentials, then add to `~/.claude.json`)

The two below are not installed yet because they need a credential or
account you haven't shared. When you do, drop the block next to `playwright`
and `kubernetes`.

### `sentry` — production error tracking

```json
"sentry": {
  "type": "stdio",
  "command": "npx",
  "args": ["-y", "@sentry/mcp-server"],
  "env": {
    "SENTRY_AUTH_TOKEN": "<paste from https://your-org.sentry.io/settings/auth-tokens/>",
    "SENTRY_HOST": "https://sentry.io",
    "SENTRY_ORG": "<your-org-slug>",
    "SENTRY_PROJECT": "vibecore"
  }
}
```

Pairs with Cloud Logging for a full request → trace correlation.

### `linear` — multi-agent task serialisation

```json
"linear": {
  "type": "stdio",
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-linear"],
  "env": {
    "LINEAR_API_KEY": "<paste from https://linear.app/settings/api>"
  }
}
```

Single source of truth for "agent A is editing `BaseChat.tsx` until 18:00"
so concurrent agents don't keep stashing each other's WIP. Substitute the
GitHub Issues MCP if you'd rather stay on GitHub.

### `gcp-logging` — Cloud Logging for non-K8s resources

Cloud SQL slow-query logs, Cloud DNS query logs, Cloud Run jobs if any
appear, and any other GCP resource that emits to Cloud Logging:

```json
"gcp-logging": {
  "type": "stdio",
  "command": "npx",
  "args": ["-y", "@google-cloud/cloud-logging-mcp@latest"]
}
```

This server is **preview as of 2026-05** — pin the version once stable.
The kubernetes MCP above already covers pod logs.

---

## 6. Smoke tests after restart

After `Cmd+Q` → relaunch, run:

```text
/mcp
```

Expect: `playwright` and `kubernetes` connected.

**Playwright smoke**:

```text
Take a screenshot of http://localhost:5173 at viewport 1446x900 and save it
to /tmp/vibecore-large.png
```

**Kubernetes smoke** (now works from this Mac via Connect Gateway):

```text
Use the kubernetes MCP to list namespaces on context
connectgateway_vibecore-495216_europe-west9_vibecore-prod-app
```

Expected: the 10 GKE-managed namespaces. Once vibecore deploys, also list
pods in `vibecore` to confirm application-side access.

If `kubectl` returns `error: You must be logged in to the server
(Unauthorized)` later, refresh the Connect Gateway kubeconfig with
`gcloud container fleet memberships get-credentials <cluster>`.

If either smoke fails, capture the error and we troubleshoot from there.
