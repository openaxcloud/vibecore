# MCP Marketplace

A curated catalog of [Model Context Protocol](https://modelcontextprotocol.io)
servers, classified by domain, that vibecore users can install into their MCP
configuration without hand-writing JSON.

## Why

The MCP service in `app/lib/services/mcpService.ts` already supports stdio /
SSE / streamable-HTTP transports, but users had to know server names, install
commands, env vars, and config shape by heart. The marketplace turns that into
a one-click experience while keeping the existing JSON editor available for
power users.

## Architecture

| Layer            | Location                                            | Notes                                             |
| ---------------- | --------------------------------------------------- | ------------------------------------------------- |
| Schema           | `packages/database/prisma/schema.prisma`            | `McpCatalogEntry`, `McpInstall`, `McpDomain` enum |
| Migration        | `0011_mcp_marketplace_and_consensus`                | Tables, indexes, CHECK constraints                |
| Seed data        | `packages/database/prisma/seed-mcp-catalog.ts`      | 22 real entries from modelcontextprotocol/servers |
| Backend service  | `services/api/src/mcp-marketplace.ts`               | Postgres-backed, JSON-Schema validator (no extra deps) |
| HTTP endpoints   | `services/api/src/app.ts` (7 routes)                | `/mcp/catalog{,/domains,/:slug}`, `/mcp/installs{,/:id}` |
| Remix proxies    | `app/routes/api.mcp.*`                              | Forward Bearer auth via `apiRequest` helper       |
| UI               | `app/components/@settings/tabs/mcp/McpMarketplace.tsx` | Domain chips, search, install dialog, installed list |

## Domains

`AI_AGENTS`, `CODE_EXECUTION`, `DATABASES`, `DEVOPS`, `DEVELOPER_TOOLS`,
`COMMUNICATION`, `PRODUCTIVITY`, `KNOWLEDGE`, `WEB_BROWSING`, `SEARCH`,
`CLOUD`, `SECURITY`, `FILESYSTEM`, `VERSION_CONTROL`, `MONITORING`, `OTHER`.

## Catalog entry shape

```ts
{
  slug: 'github',                        // unique handle
  name: 'GitHub',
  description: '...',
  domain: 'VERSION_CONTROL',
  tags: ['git', 'github', 'official'],
  author: 'modelcontextprotocol',
  homepageUrl: 'https://github.com/.../servers/tree/main/src/github',
  version: '0.6.2',
  transport: 'STDIO',                    // or 'SSE' | 'STREAMABLE_HTTP'
  configTemplate: { type: 'stdio', command: 'npx', args: [...], env: {...} },
  configSchema: {                        // JSON Schema subset
    type: 'object',
    properties: { GITHUB_PERSONAL_ACCESS_TOKEN: { type: 'string', minLength: 10 } },
    required: ['GITHUB_PERSONAL_ACCESS_TOKEN'],
  },
  featured: true,
  verified: true,
}
```

## Install lifecycle

1. **Browse** `GET /mcp/catalog?domain=DATABASES&search=postgres&limit=20`.
2. **Install** `POST /mcp/installs` with `{ catalogEntrySlug, alias, config }`.
   - Server validates `config` against the entry's `configSchema`. Missing
     required fields → `400 MCP_CONFIG_INVALID`. Duplicate alias → `409
     MCP_ALIAS_CONFLICT`.
   - On success, `installCount` is incremented inside the same transaction.
3. **List** `GET /mcp/installs` returns the user's installs (per-user; org
   sharing is opt-in via the `organizationId` query param).
4. **Toggle / update** `PATCH /mcp/installs/:id` with any of `enabled`,
   `alias`, `config`.
5. **Uninstall** `DELETE /mcp/installs/:id`. Decrements `installCount`.

All install / update / uninstall actions emit an audit log entry under the
`mcp_marketplace.*` action namespace.

## JSON-Schema validator

`services/api/src/mcp-marketplace.ts` implements a minimal validator covering
the subset used by catalog entries: `type` (string/number/integer/boolean),
`required`, `minLength` / `maxLength` / `pattern`, `format=uri`, `minimum` /
`maximum`, `enum`, and `additionalProperties=false`. It returns a list of
human-readable error strings instead of throwing so the API can surface them
to the install dialog.

## Tests

`services/api/src/tests/mcp-marketplace.spec.ts` — 5 unit tests for the
validator + 5 integration tests against a real Postgres (catalog list with
domain/search/featured filters, cursor pagination, 404 handling, full
install/patch/uninstall lifecycle, per-user isolation). Zero mocks.

`tests/e2e/mcp-marketplace.spec.ts` — Playwright API contract tests +
settings-tab UI rendering smoke.

## Running locally

```bash
docker compose -f docker-compose.dev.yml up -d postgres
export DATABASE_URL='postgresql://vibecore:vibecore@127.0.0.1:55432/vibecore'
pnpm --filter @vibecore/database db:deploy
pnpm --filter @vibecore/database db:seed   # loads the 22 catalog entries
pnpm dev
```

Open Settings → MCP. The default sub-tab is **Marketplace**; the existing JSON
editor lives under the **Configuration** sub-tab.
