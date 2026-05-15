# MCP servers — what's wired, what's optional, what's vestigial

Vibecore deploys to **Google Cloud Platform on GKE** (see `infra/gcp/bootstrap.sh`,
`infra/helm/platform/`, `.github/workflows/deploy-prod.yml`). The
`wrangler.toml`, `@remix-run/cloudflare-pages`, and `pages_build_output_dir`
files are **leftovers from the Bolt.diy fork** and are not on the prod path —
they pre-date the move to GKE and should eventually be removed.

Three classes of work where Claude Code currently flies blind:

  1. **Visual / frontend** — no headed browser, no screenshots, every UI fix
     is reasoned about from source instead of seen.
  2. **Production observability** — runtime errors and pod logs live in
     **Cloud Logging on GCP**, not in Cloudflare. Without a binding into
     them we ship and pray.
  3. **Multi-agent coordination** — concurrent agents racing on the same
     files (we hit this 5+ times in one week) ate roughly a third of every
     session in stash / pop / retry.

This file lists the MCP servers that close each gap, which one is wired
today and what's left to enable.

## Installed (auto-active)

### `playwright` (stdio)

Source: [`@playwright/mcp`](https://github.com/microsoft/playwright-mcp).
Registered in **`~/.claude.json` top-level `mcpServers`**:

```json
{
  "mcpServers": {
    "playwright": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@playwright/mcp@latest"]
    }
  }
}
```

Loaded automatically by every Claude Code session at user level — no per-
project trust dialog. Provides `browser_navigate`, `browser_take_screenshot`,
`browser_resize`, `browser_click`, `browser_snapshot` and the rest of the
Playwright API as MCP tools.

**What it unlocks**: visual validation of CSS/UI changes at multiple
viewports (1446 / 800 / 500 px), before/after screenshots, accessibility
snapshots from real Chromium. Bundled chromium binaries are already cached at
`~/Library/Caches/ms-playwright/`.

**Restart**: a new Claude Code session is required for the server to pick up.

## Not the right MCP for vibecore prod ops

### `claude.ai Cloudflare Developer Platform`

Already in the user's `claude.ai` catalogue and currently authenticated
(`mcpsrv_013QKg5y5UfoW2uCwuKiASod`). **But vibecore does not run on
Cloudflare** — the prod stack is GKE on GCP. Keeping the connector
authenticated is harmless but does not surface vibecore's logs, pods or
databases. Disconnect via `/mcp` if it's not used for any of your other
projects.

## Opt-in (you provide credentials, then add to `~/.claude.json`)

### `gcp` — GKE pods, Cloud Logging, Cloud SQL, GCS

This is the one that actually maps to vibecore's prod. There is no single
official Google-Cloud-wide MCP yet — viable options as of 2026-05:

  - [`@google-cloud/mcp-gke`](https://github.com/GoogleCloudPlatform/mcp-gke)
    when it's stable enough — `kubectl get pods`, `kubectl logs`,
    deployment status, pod restart.
  - [`cloud-logging-mcp`](https://github.com/GoogleCloudPlatform/cloud-logging-mcp)
    — `gcloud logging read`, query the Cloud Logging API for any
    severity / resource type. This is where vibecore's prod traces live.
  - In the meantime: bare `gcloud` and `kubectl` via Bash on this machine
    if you've authenticated locally (`gcloud auth login`).

If you want, drop the GCP project ID + the workload service account into
the MCP block once the official servers stabilise. Today the realistic move
is the Bash route plus the GitHub Actions logs from `.github/workflows/`.

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

**What it unlocks**: when a screenshot in `#bugs` says "white screen at
/projects/new", I can fetch the exception, stack trace, breadcrumbs and
release tag without you copy-pasting from the dashboard. Pairs naturally
with Cloud Logging for a full request → trace correlation.

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

**What it unlocks**: a single source of truth for "agent A is editing
`app/components/chat/BaseChat.tsx` until 18:00" so concurrent agents don't
keep stashing each other's WIP. Free for teams under 250 issues; substitute
the GitHub Issues MCP if you prefer staying on GitHub.

## What about the Cloudflare leftovers in the repo?

These come from the Bolt.diy fork and are not in the GKE deployment path:

  - `wrangler.toml` — references `bolt` as the Pages project name.
  - `pages_build_output_dir = "./build/client"` in `wrangler.toml`.
  - `"deploy": "npm run build && wrangler pages deploy"` script in
    `package.json` — won't be used by `deploy-prod.yml`.
  - `@remix-run/cloudflare`, `@remix-run/cloudflare-pages`,
    `@cloudflare/workers-types`, `wrangler` dev dependencies.
  - `cloudflareDevProxyVitePlugin` in `vite.config.ts` — only used by
    `pnpm dev` locally.

If you confirm Cloudflare is never going to come back as a deploy target,
a clean-up commit would:

  1. Replace `@remix-run/cloudflare` with `@remix-run/node` in the route
     types and `enterprise-api.server.ts`.
  2. Remove `wrangler.toml`, the deploy / start / typegen scripts that
     call `wrangler`, and the `wrangler` dev dependency.
  3. Strip `cloudflareDevProxyVitePlugin` from `vite.config.ts`.
  4. Replace `context.cloudflare.env` reads with `process.env` (or whatever
     the GKE pod uses for secret injection — Workload Identity + Secret
     Manager).

That's a sensible follow-up but not blocking — the current setup builds
and runs because the Cloudflare bits are only loaded when `wrangler pages
deploy` is invoked, which `deploy-prod.yml` does not do.

## Verifying after restart

Open any Claude Code session and run:

```text
/mcp
```

The list should show `playwright` as connected. The Cloudflare entry will
also be listed and authenticated, but as noted above it is not the right
tool for vibecore's prod ops. The Sentry / Linear / GCP ones only appear
once their blocks are added and credentials present.

To smoke-test Playwright without leaving Claude Code:

```text
Take a screenshot of http://localhost:5173 at viewport 1446x900 and save it
to /tmp/vibecore-large.png
```

If the screenshot appears at the path, the visual-validation gap is closed.
