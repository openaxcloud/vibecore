# MCP servers — what's wired up, what's optional

Vibecore runs on Cloudflare Workers and ships with three classes of work where
Claude Code is currently flying blind:

  1. **Visual / frontend** — no headed browser, no screenshots, every UI fix
     is reasoned about from source instead of seen.
  2. **Production observability** — runtime errors and Worker logs only live
     in Cloudflare; without a binding into them we ship and pray.
  3. **Multi-agent coordination** — concurrent agents racing on the same
     files (we hit this 5+ times in one week) ate roughly a third of every
     session in stash / pop / retry.

This file lists the MCP servers that close each gap, which one is wired today
and what's left to enable.

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

## Catalogue (already in your account, just needs auth)

### `Cloudflare Developer Platform`

Already registered in your `claude.ai` MCP catalogue (cached under
`~/.claude/mcp-needs-auth-cache.json` as `mcpsrv_013QKg5y5UfoW2uCwuKiASod`).
The two tools currently visible without auth are:

  - `mcp__claude_ai_Cloudflare_Developer_Platform__authenticate`
  - `mcp__claude_ai_Cloudflare_Developer_Platform__complete_authentication`

Run the first one in any Claude Code session, complete the OAuth dance in the
browser tab it opens, and Workers / KV / R2 / D1 / Logs tools unlock. The
auth survives across sessions.

**What it unlocks**: tailing Cloudflare Workers logs (which is where the
vibecore prod errors actually live, given `wrangler.toml` and the
`@remix-run/cloudflare` runtime), inspecting deployments, querying D1
databases, listing KV namespaces.

## Opt-in (you provide credentials, then add to `~/.claude.json`)

The two below are not installed yet because they need an account + API key
you haven't given me. When you do, drop the block into the same
`mcpServers` object next to `playwright`.

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
with the Cloudflare logs MCP above for a full request → trace correlation.

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
BaseChat.tsx until 18:00" so concurrent agents don't keep stashing each
other's WIP. Free for teams under 250 issues; substitute the GitHub Issues
MCP if you prefer staying on GitHub.

## Verifying after restart

Open any Claude Code session and run:

```text
/mcp
```

The list should show `playwright` as connected. If Cloudflare was authed,
that server shows up too. The Sentry / Linear ones only appear once their
blocks are added and credentials present.

To smoke-test Playwright without leaving Claude Code:

```text
Take a screenshot of http://localhost:5173 at viewport 1446x900 and save it
to /tmp/vibecore-large.png
```

If the screenshot appears at the path, the visual-validation gap is closed.
