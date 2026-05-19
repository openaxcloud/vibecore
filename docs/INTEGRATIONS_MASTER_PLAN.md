# Integrations Master Plan

Master plan for the IDE Integrations panel — full parity with Replit's Connectors UX, adapted to e-code.ai infrastructure.

This document is the single reference for the whole chantier. It supersedes the integrations row in `IDE_PANEL_AUDIT.md` (currently "Partial").

## 1. Domain and brand

| Surface | Value |
|---|---|
| Production root | `e-code.ai` |
| App frontend (Remix) | `app.e-code.ai` |
| API service | `api.e-code.ai` |
| Workspace manager | `workspace-manager.e-code.ai` |
| User app previews | `*.preview.e-code.ai` |
| GCP zone | `e-code-ai` (europe-west9) |
| Ingress static IP | `34.1.6.93` |
| OAuth callback (integrations) | `https://app.e-code.ai/integrations/oauth/:provider/callback` |
| Webhook receiver | `https://api.e-code.ai/webhooks/:provider` |
| Sidecar (internal) | `connector-proxy.internal` (no public DNS) |
| User-facing brand | `e-code` (UI copy: "e-code managed", "e-code Auth", "e-code Database", …) |
| Internal code namespace | `vibecore` (no rename — packages stay `@vibecore/*`) |
| Public SDK package | `@e-code/sdk` |

## 2. What already exists (reuse, don't recreate)

Two successive audits of the codebase revealed substantial existing infrastructure (some of it broken). The new work must integrate with what works, repair what is broken, and avoid duplication.

### State of the 5 existing Settings integration tabs

A live code audit found that the 5 Settings tabs (~3800 lines) are NOT uniformly production-ready:

| Tab | File | Verdict | Tokens stored where | Backend routes |
|---|---|---|---|---|
| Netlify | `app/components/@settings/tabs/netlify/NetlifyTab.tsx` (1398 lines) | **PROD-READY** (provider integration works) | localStorage + cookie | none — direct `api.netlify.com` |
| GitLab | `app/components/@settings/tabs/gitlab/GitLabTab.tsx` (~305 lines) | **PARTIAL** (frontend works, no server persistence) | localStorage | none — direct `gitlab.com` |
| Vercel | `app/components/@settings/tabs/vercel/VercelTab.tsx` (910 lines) | **PARTIAL** (metrics stubbed, missing routes) | localStorage + cookie | `/api/vercel-user` **DOES NOT EXIST** in `services/api/src/app.ts` |
| GitHub | `app/components/@settings/tabs/github/GitHubTab.tsx` (282 lines) | **STUB / UI-ONLY** | localStorage | `/api/github-user`, `/api/github-stats` **DO NOT EXIST** |
| Supabase | `app/components/@settings/tabs/supabase/SupabaseTab.tsx` (1091 lines) | **STUB / UI-ONLY** (rich UI, 100% broken backend) | localStorage | `/api/supabase`, `/api/supabase/variables`, `/api/supabase-user` **DO NOT EXIST** |

Security findings common to all 5:
- All tokens stored in **plaintext localStorage** (XSS vector, no encryption-at-rest)
- No server-side persistence — users lose connections when switching devices
- No tests for any of the 5 tabs
- No OAuth flow — manual Personal Access Token paste only

This chantier repairs all 5 tabs by migrating their token storage to the new `UserConnection` table (encrypted server-side) and implementing the missing backend routes. The Replit-parity IDE panel is delivered *after* this foundation is solid.

The `ConnectionsTab.tsx` (`app/components/@settings/tabs/connections/ConnectionsTab.tsx`, 106 lines) is a navigation hub that links out to the 8 sub-tabs (github, gitlab, netlify, vercel, supabase, cloud-providers, local-providers, mcp). It stays as a navigation hub.

### MCP Marketplace (reuse intact)
- Schema: `McpCatalogEntry`, `McpInstall`, `McpDomain` enum — `packages/database/prisma/schema.prisma:902-962`
- Migration: `0011_mcp_marketplace_and_consensus`
- 22 entries seeded in `packages/database/prisma/seed-mcp-catalog.ts`
- Service: `services/api/src/mcp-marketplace.ts` (Postgres-backed + JSON-Schema validator)
- 7 HTTP endpoints under `/mcp/*`
- Current UI lives in Settings → MCP (`app/components/@settings/tabs/mcp/McpMarketplace.tsx`)
- Tests: `services/api/src/tests/mcp-marketplace.spec.ts`

Reused as-is. The new IDE Integrations panel `MCP Servers` section reads from the same tables, with a `featuredForIdePanel` flag added to surface the 19 Replit-style partner entries (Stripe MCP, Linear MCP, Notion MCP, Sentry, Atlassian, Miro, PostHog, Amplitude, Mixpanel, Granola, Razorpay, Sanity, Wistia, Google Maps Platform, Squidler, Lazyweb, Twilio, Doola, Figma) on top of the existing 22 general MCP servers.

### Stripe billing webhook pattern (reuse pattern)
- `POST /billing/stripe/webhook` handler at `services/api/src/app.ts` (see `docs/STRIPE_WEBHOOKS.md`)
- HMAC SHA-256 signature verification on raw body
- Idempotency via `StripeEvent` table
- Required env: `STRIPE_WEBHOOK_SECRET`, `STRIPE_SECRET_KEY`

This stays dedicated to e-code's billing subscriptions. A new generic `/webhooks/:provider` handler reuses the same HMAC + idempotency pattern for connector webhooks (Slack, GitHub events, Stripe-as-user-app-payment, etc.).

### GitHub git integration (separate from agent connector)
- Existing routes documented in `docs/GITHUB_INTEGRATION.md`: import, status, commit, push, pull, branches, PRs
- `MockGitProvider` for tests
- OAuth tokens stored as encrypted project secrets

Stays as `UserConnection { provider: 'github_git', forAgentUse: false }`. A second OAuth flow with broader scopes (`read:org`, `read:user`, `read:project` in addition to `repo`) feeds `UserConnection { provider: 'github', forAgentUse: true }` for agent-driven actions.

### Current Integrations panel (legacy to migrate)
- Route: `app/routes/api.projects.$projectId.ide-panel.$panel.ts:479` (GET) and `:1247` (POST)
- State stored as JSON inside project env var `VIBECORE_INTEGRATIONS_STATE`
- Sub-resources: `integrations[]`, `webhooks[]`, `apiKeys[]`, `eventStreams[]`
- Fake "connect" intent: writes `INTEGRATION_TOKEN_<ID>` to project secrets, sets `connected: true`, no real OAuth

The `webhooks[]` and `apiKeys[]` structures stay as features inside the Manage sub-view. The `integrations[]` fake state is replaced by real `UserConnection + ProjectConnectionLink` records. A one-shot migration script preserves any user-entered webhook URLs.

### Encryption (reuse intact)
- `packages/security/src/index.ts:78-101` — `encryptJson()` / `decryptJson()` (AES-256-GCM, 12-byte nonce, auth tag, key derived from `ENCRYPTION_SECRET`)

Used for every new encrypted column (`accessTokenEncrypted`, `refreshTokenEncrypted`, `clientSecretEncrypted`, `apiKeyFieldsEncrypted`, `customHeadersEnc`).

### THREE distinct GitHub flows coexist (do NOT confuse them)

GitHub appears in three orthogonal subsystems. Phase 1 adds the third one without modifying the first two.

1. **Git operations** — `services/api/src/app.ts:2242 commitInitialScaffold`, line 5195 `gitProvider.commit`, lines 6774/6809/6852/6874/6925 (project creation, GitHub import, auto-commit on scaffold). Implementation: `GitCliProvider` (real Git CLI) with credentials stored as project secret. Used by the agent today to clone repos, commit, push, pull. **Untouched by this chantier.**
2. **GitHub Login** — `app.ts:3890 /auth/oauth/github/start`, `:3896 /auth/oauth/:provider/callback`. OAuth flow with **hashed** tokens in `OAuthConnection` (`schema.prisma:889-900`). Used solely for user login. **Untouched.**
3. **GitHub Connector for the agent** — NEW. OAuth flow with **encrypted reversible** tokens in `UserConnection`, callback `/integrations/oauth/github/callback`, accessed via `connector-proxy` sidecar. Lets the agent call the GitHub REST API for actions beyond pure git (create issues, comment PRs, list repos, etc.). **This is the only GitHub flow Phase 1 builds.**

The user-visible Settings tab `GitHubTab.tsx` is repaired in Phase 1 by implementing the missing `/api/github-user` and `/api/github-stats` routes backed by the new `UserConnection` — these were referenced for display purposes (profile, stats) and never touched the auto-commit flow.

### MCP appears in three surfaces (single source of truth)

`McpCatalogEntry` + `McpInstall` is the canonical data layer. Three UI surfaces read it:

1. **Settings → MCP** (existing, `app/components/@settings/tabs/mcp/`) — JSON editor + marketplace browse. Power-user view. Untouched.
2. **Chat MCP popover** (existing, `app/components/chat/MCPTools.tsx`, button in `ChatBox.tsx:14`) — shows the MCP tools currently available to the agent, refresh button, deep link to Settings → MCP. Reads `useMCPStore` which mirrors `McpInstall`. **Untouched.**
3. **IDE Integrations panel → MCP Servers section** (new, Phase 3) — Replit-style curated catalogue with `featuredForIdePanel` filter, one-click "Sign in" / "Add MCP server" modal. Same `McpCatalogEntry` + `McpInstall` tables.

Add an MCP via any of the three surfaces → it appears immediately in the other two. Zero regression on the existing chat popover and Settings tab.

### OAuth state HMAC (reuse intact, do NOT create new)
- `signOauthState(provider, ttlSeconds=600)` — `services/api/src/app.ts:3795-3802`
- `verifyOauthState(state, provider)` — `services/api/src/app.ts:3804-3826`
- `oauthStateSecret()` helper reads `OAUTH_STATE_SECRET` env var
- Already used by Google login, GitHub login, OIDC SSO flows

The connector OAuth flow reuses these helpers verbatim. No new state mechanism.

### Auth + workspace middleware (reuse intact)
- `requireProject(request, store, projectId, permission)` — `services/api/src/app.ts:1405-1416`
- `requireWorkspace(request, store, workspaceId, permission)` — `services/api/src/app.ts:1622-1636`
- `requireOrg(request, store, organizationId, permissions)` — `services/api/src/app.ts:1359-1380`
- `ensureQuota(request, orgId, quotaKey)` — wraps `QuotaLedger` lookups, used for plan gating

Every new route below uses these — no bypass paths.

### Existing `OAuthConnection` table (DIFFERENT purpose — do NOT extend)
- `packages/database/prisma/schema.prisma:889-900`
- Fields: `userId`, `provider`, `externalId`, `accessHash`, `refreshHash`
- Stores **hashed** tokens, NOT reversible — used solely for the LOGIN flow (Google login, GitHub login, OIDC SSO)
- Cannot be used to make API calls to providers (tokens are gone)

The new `UserConnection` table is genuinely needed for reversible-encrypted tokens that the sidecar proxy uses to call provider APIs. The two tables coexist and serve different purposes.

### Existing `AuditLog` + automatic SIEM delivery (reuse for connector audit)
- `AuditLog` table at `schema.prisma:534-549`
- After every `AuditLog.create()`, the org's enabled `SiemWebhook` records are POSTed asynchronously (`app.ts:3057-3100`) with HMAC-SHA256 signature
- New connector-related actions plug into the same surface:
  - `connector.api_call` (one row per sidecar request)
  - `connector.oauth.connect`, `connector.oauth.revoke`, `connector.oauth.refresh`
  - `connector.webhook.received`
  - `connector.scope.upgraded`

This **replaces** the previously planned `ConnectionAccessLog` dedicated table. No new audit table needed.

### Existing `McpInstall.projectId` (already supports per-project scoping)

`McpInstall` already has `projectId String?` (added in a post-0011 migration, visible at `packages/database/prisma/schema.prisma:990`). The "subscribe an MCP server to a project" feature works today — the new IDE panel just adds a curated `featuredForIdePanel` view on top, no schema change.

### Specialized packages (reuse, do NOT duplicate)

The codebase has dedicated packages that already implement utilities the plan needed. Every new module pulls from them:

- `packages/audit/src/index.ts` — `AuditEvent`, `AuditSink`, `criticalAuditActions` (set of high-signal action keys for SIEM forwarding), `redactAuditMetadata` (strips secrets from metadata before audit insert). Every new `AuditLog.create` for connectors uses these.
- `packages/auth/src/index.ts` — `hashToken`, `createOpaqueToken`, `hashPassword`, `verifyPassword`, `authCookieOptions`, TOTP helpers. The new sidecar JWT auth reuses `hashToken` + `createOpaqueToken` patterns.
- `packages/quota/src/index.ts` — `QuotaLimit`, `QuotaUsage`, `assertWithinQuota`. Plan gating in §9 calls `assertWithinQuota` through the existing `ensureQuota(request, orgId, key, increment)` middleware at `app.ts:4973` (already used 10+ times for `ai.toolCalls`, `deployments.count`, `workspaces.active`, etc.).
- `packages/rbac/src/index.ts` — `PermissionKey`, `rolePermissions`, `hasPermission`, `requirePermission`. The `allowedRoleKeys` field in `OrganizationConnectorPolicy` cross-references existing `Role.key` + `CustomRole.key`; the sidecar's permission check at step 4 of the ACL uses `hasPermission(roleKey, 'integrations:use')`.
- `packages/observability/` — structured logging + metrics. Sidecar emits spans/counters here, no parallel system.

### Agent orchestration location (verified)

The e-code agent does NOT live in `services/workspace-agent/` (which is a 3-file workspace-side runtime). The actual LLM-driven agent is in `app/lib/.server/llm/agent-orchestration.ts` (413 lines).

Notable surface:
- `AgentRoleId = 'architect' | 'frontend' | 'backend' | 'devops' | 'qa'` — multi-role orchestration (parallel subagents OR single-model-lanes mode)
- `ECODE_AGENT_ROLES` constant at line 155
- `executeAgentOrchestration(input)` at line 293
- `createAgentOrchestrationPrompt(plan)` at line 389 — system prompt builder

The new connector detection + `connection_request` emission hooks into `executeAgentOrchestration`. The plan's "Agent layer" code lives here, not in workspace-agent.

### Chat message format (verified — uses Vercel AI SDK)

Chat messages use the Vercel AI SDK's `Message` type (`import type { Message } from 'ai'`). The codebase extends it via `ChatMessage` interface at `app/lib/persistence/chats.ts:8`. New agent message kinds (`connection_request`, `secret_request`, `connection_resolved`, `connection_failed`) are emitted as **AI SDK data parts** (custom annotations on the message stream), not as a new runtime-contract type. This avoids forking the chat protocol.

### No-mocks gate (CI-enforced — affects every new file)

`scripts/check-no-runtime-mocks.mjs` scans `app/`, `services/`, `packages/`, `infra/` for blocked patterns:

```
/\b(Mock|mock|InMemory|stub|fake|scaffolded)\b|Test(ApiStore|ProjectStorage|GitProvider|EmailProvider|WorkspaceStore|EventBus|WorkspaceK8sClient)/
```

Run by `pnpm run platform:no-mocks` and chained into `platform:verify`. Tests are excluded (`*.spec.*`, `*.test.*`, `/tests/`, `/src/tests/`).

Every new file in this chantier — sidecar service, SDK package, route handler, frontend component, agent module — must not contain those identifiers in non-test code. The plan's previous mention of `MockGitProvider` for testing is fine inside `.spec.ts`, not elsewhere. New mocks must be implemented as real adapters with a different naming convention (e.g. `RecordingConnectorAdapter`, `OfflineConnectorAdapter`).

### Workers (run in existing `services/worker/`)

`services/worker/src/index.ts` (118 lines) is the existing background worker entrypoint. The §10 workers (`tokenRefresher`, `tokenHealthCheck`, `reconnectionAlertNotifier`, `auditLogAggregator`, `auditLogExporter`) are added as new modules consumed by this service — not as standalone services.

## 3. Panel architecture — 4 sections

The IDE Integrations panel is one tab in the IDE main pane. It contains exactly 4 stacked sections in this order, mirroring Replit one-to-one:

1. **e-code managed** — built-in services (Database, Project Storage, Auth, Domains). Table-only, no OAuth, each row links to the existing IDE panel for that service.
2. **Connectors** — first-party OAuth/API-key integrations. 2 tabs: "Used in this project" / "All connectors".
3. **MCP Servers for e-code Agent** — Beta badge. Reads from `McpCatalogEntry` filtered by `featuredForIdePanel = true`. Custom MCP server addition via modal.
4. **Git Providers** — GitHub, Bitbucket, GitLab. Marked `forAgentUse = false`. Drives the existing git import/commit/push routes. Not visible to the agent's tool registry.

AI model providers (OpenAI, Anthropic, Gemini, OpenRouter) live elsewhere — not in this panel. Vibecore-credits vs BYOK selection is part of agent settings, not Integrations.

## 4. Database schema additions

Below the new tables. Existing tables (`McpCatalogEntry`, `McpInstall`, `Project`, `Workspace`, `Organization`, `User`, `ProjectSecret`) are reused as-is.

```prisma
// === Catalog of supported connectors (Section 2 + Section 4)
model ConnectorCatalog {
  id                      String   @id @default(cuid())
  provider                String   @unique
  displayName             String
  description             String
  category                String                       // 'communication' | 'storage' | 'crm' | 'payments' | 'productivity' | 'analytics' | 'dev' | ...
  authType                String                       // 'oauth' | 'api_key'
  section                 String                       // 'connectors' | 'git_providers' | 'managed'
  logoUrl                 String

  defaultClientId         String?
  defaultClientSecretEnc  String?
  authorizeUrl            String?
  tokenUrl                String?
  revokeUrl               String?
  userInfoUrl             String?
  defaultScopes           String[]
  availableScopes         String[]

  apiKeyFields            Json?                        // [{name, label, type, required}]
  apiKeyTestEndpoint      String?

  triggersSupported       String[]
  triggerDescriptions     Json                         // { 'repo_created': 'Repo Created', ... }

  webhookSupport          Boolean  @default(false)
  webhookSignatureScheme  String?

  minPlanTier             String                       // 'free' | 'pro' | 'enterprise'
  forAgentUse             Boolean  @default(true)
  displayOrder            Int      @default(0)
  enabled                 Boolean  @default(true)
  createdAt               DateTime @default(now())
  updatedAt               DateTime @updatedAt
}

// === User-scoped OAuth/API-key connections (account level, Replit-style)
model UserConnection {
  id                      String   @id @default(cuid())
  userId                  String
  provider                String
  externalAccountId       String
  externalAccountLabel    String

  accessTokenEncrypted    String?
  refreshTokenEncrypted   String?
  apiKeyFieldsEncrypted   Json?

  scopes                  String[]
  tokenExpiresAt          DateTime?
  status                  String                       // 'active' | 'needs_reconnect' | 'revoked'
  lastUsedAt              DateTime?
  forAgentUse             Boolean  @default(true)

  oauthAppSource          String                       // 'e_code_default' | 'org_override'
  oauthAppOverrideId      String?

  createdByUserId         String
  createdAt               DateTime @default(now())
  updatedAt               DateTime @updatedAt
  revokedAt               DateTime?

  user                    User     @relation(fields: [userId], references: [id])
  oauthAppOverride        OrganizationOAuthAppOverride? @relation(fields: [oauthAppOverrideId], references: [id])
  projectLinks            ProjectConnectionLink[]

  @@unique([userId, provider, externalAccountId])
  @@index([userId, provider])
  @@index([status])
}

// === Per-project linkage to a UserConnection (a project opts in to a connection)
model ProjectConnectionLink {
  id                  String   @id @default(cuid())
  projectId           String
  userConnectionId    String
  linkedByUserId      String
  linkedAt            DateTime @default(now())
  unlinkedAt          DateTime?

  project             Project        @relation(fields: [projectId], references: [id])
  userConnection      UserConnection @relation(fields: [userConnectionId], references: [id])

  @@unique([projectId, userConnectionId])
  @@index([projectId])
}

// === Enterprise: per-org OAuth app override (custom Client ID/Secret/scopes)
model OrganizationOAuthAppOverride {
  id                      String   @id @default(cuid())
  organizationId          String
  provider                String
  clientId                String
  clientSecretEncrypted   String
  scopes                  String[]
  configuredByUserId      String
  testedAt                DateTime?
  testStatus              String?
  testError               String?
  createdAt               DateTime @default(now())
  updatedAt               DateTime @updatedAt

  organization            Organization     @relation(fields: [organizationId], references: [id])
  userConnections         UserConnection[]

  @@unique([organizationId, provider])
}

// === Enterprise: connector visibility + role ACL (NO Groups table exists today)
model OrganizationConnectorPolicy {
  id                      String   @id @default(cuid())
  organizationId          String
  provider                String
  enabled                 Boolean  @default(true)
  allowedRoleKeys         String[]                     // matches existing Role.key + CustomRole.key (NOT groupIds — Vibecore has no Groups concept)
  rateLimitOverride       Int?
  createdAt               DateTime @default(now())
  updatedAt               DateTime @updatedAt

  organization            Organization @relation(fields: [organizationId], references: [id])

  @@unique([organizationId, provider])
}

// (Audit: see "Existing AuditLog + automatic SIEM delivery" — uses existing AuditLog table,
//  no dedicated ConnectionAccessLog table is created.)

// === Persistent "needs reconnect" alerts
model ReconnectionAlert {
  id                  String   @id @default(cuid())
  userConnectionId    String
  reason              String
  detectedAt          DateTime @default(now())
  resolvedAt          DateTime?
  notifiedAt          DateTime?

  @@index([userConnectionId, resolvedAt])
}

// === User-submitted "request a new integration" entries
model IntegrationFeatureRequest {
  id                  String   @id @default(cuid())
  userId              String
  organizationId      String?
  integrationName     String
  useCaseDescription  String
  status              String   @default("pending")
  createdAt           DateTime @default(now())
}
```

Existing `McpCatalogEntry` gets one new column: `featuredForIdePanel Boolean @default(false)`.

## 5. Backend services

### 5.1 `services/api` — new routes

```
GET    /api/projects/:projectId/integrations/panel
       Returns the full panel state: managed services, connectors (catalog + states),
       MCP entries with subscription status, git providers.

GET    /api/projects/:projectId/integrations/connectors?tab=used|all
POST   /api/integrations/oauth/:provider/connect      { projectId } → { redirectUrl }
GET    /integrations/oauth/:provider/callback         (Remix route, posts message to opener)
POST   /api/integrations/connections/:id/revoke
POST   /api/integrations/connections/:id/refresh
POST   /api/integrations/connections/:id/test
POST   /api/projects/:projectId/integrations/:provider/link/:userConnectionId
DELETE /api/projects/:projectId/integrations/:provider/link/:userConnectionId
GET    /api/account/connections
GET    /api/integrations/connections/:id              full Manage view payload
DELETE /api/integrations/connections/:id

POST   /api/integrations/api-key/:provider/configure  { projectId, fields }
POST   /api/integrations/api-key/:provider/test

POST   /api/integrations/feature-requests             { integrationName, useCaseDescription }

GET    /api/mcp/ide-panel-catalog                     filtered McpCatalogEntry featuredForIdePanel=true
POST   /api/projects/:projectId/mcp/subscribe         either catalog slug or custom { displayName, url, headers }

POST   /api/integrations/git/:provider/connect        github|bitbucket|gitlab — forAgentUse=false
DELETE /api/integrations/git/:provider

POST   /webhooks/:provider                            generic signed webhook receiver

GET    /api/orgs/:orgId/integrations/policy
PUT    /api/orgs/:orgId/integrations/policy/:provider
GET    /api/orgs/:orgId/integrations/oauth-apps/:provider
PUT    /api/orgs/:orgId/integrations/oauth-apps/:provider
POST   /api/orgs/:orgId/integrations/oauth-apps/:provider/test
GET    /api/orgs/:orgId/integrations/audit
```

All project-scoped routes go through `requireProject(..., 'admin' | 'read')`. All org routes go through `requireOrg(..., 'admin')`. Webhooks authenticate by signature only.

### 5.2 `services/connector-proxy` — new sidecar service

Internal HTTP service. Workspaces (sandboxes) and the agent runtime call it instead of provider APIs directly. Tokens never leave the proxy.

Endpoints:
- `POST /proxy/:userConnectionId/*` — forwards to provider with injected `Authorization` header
- `POST /agent-services/:service/*` — Vibecore-pool-keyed proxied APIs (deferred to Phase 2)
- `POST /mcp/:subscriptionId/*` — proxies to the MCP server endpoint, injects auth if configured
- `GET /healthz`

Auth: HMAC-signed JWT containing `workspaceId` + `projectId` + `agentSessionId`, same pattern as `packages/workspace-sdk/src/index.ts:32-53`.

ACL on every request:
1. JWT validates → extract `workspaceId`, `projectId`
2. `workspace.projectId === jwt.projectId` (Prisma lookup)
3. `ProjectConnectionLink` exists for `(projectId, userConnectionId)`
4. `OrganizationConnectorPolicy` allows this provider for this org and the user's role key is in `allowedRoleKeys`
5. Rate limit OK (Redis token bucket per `(userId, provider)`)
6. Decrypt token via `decryptJson()`
7. Forward request, stream response
8. On 401/403 from provider: mark `UserConnection.status='needs_reconnect'`, create `ReconnectionAlert`, publish Redis event
9. Insert `AuditLog { action: 'connector.api_call', resourceType: 'UserConnection', resourceId: userConnectionId, metadata: { method, path, statusCode, agentSessionId } }` (no dedicated table)
10. Update `UserConnection.lastUsedAt`

### 5.3 `packages/connector-sdk` — new package

Type-safe SDK injected in workspaces, published publicly as `@e-code/sdk` (private internal name `@vibecore/connector-sdk`).

```typescript
import { ecode } from '@e-code/sdk';

await ecode.stripe.charges.create({ amount: 1000, currency: 'usd' });
await ecode.slack.chat.postMessage({ channel: '#general', text: 'Hello' });
```

Generated from `ConnectorCatalog` at build time. Every call goes through `connector-proxy.internal`. Tokens never appear in user code.

### 5.4 `packages/runtime-contract` — message type extensions

New message variants in the agent ↔ chat protocol:

```typescript
type AgentMessage =
  | { kind: 'connection_request', messageId, provider, providerDisplayName, providerLogoUrl,
      scopes, scopeDescriptions, reason, resumeToken,
      existingAccountConnections?: { userConnectionId, accountLabel, scopes, scopesMatch }[] }
  | { kind: 'connection_resolved', messageId, provider, accountLabel, userConnectionId }
  | { kind: 'connection_failed', messageId, provider, reason }
  | { kind: 'secret_request', messageId, secretKey, displayName, description, placeholderExample?, resumeToken }
  | { kind: 'secret_provided', messageId, secretKey }
  | ...existing kinds
```

## 6. UI — `app/components/ide-panel/integrations/`

Full pixel-exact spec captured during this chantier — see § "Replit-parity panel spec" below.

### 6.1 Design tokens (Replit-matching palette)

```
--bg-panel:        #F7F8F9
--bg-card:         #FFFFFF
--bg-hover:        #F9FAFB
--border-fine:     #E5E7EB
--text-primary:    #0F172A
--text-secondary:  #6B7280
--text-placeholder:#9CA3AF
--accent-blue:     #3B82F6
--accent-green:    #10B981
--destructive-bg:  #B91C1C
--destructive-text:#DC2626
--warning-bg:      #FEF2F2
--warning-border:  #FECACA
--badge-beta-bg:   #E0F2FE
--badge-beta-text: #0369A1
--toast-bg:        #1F2937
--ecode-orange:    #F97316
```

Width max 800px. Section gap 40px. Card padding 16px. Outline buttons 28-32px height, radius 6px. Primary buttons 36-44px, radius 6-8px. Modal radius 12px, padding 24-32px.

Lucide icons: `Layers`, `Search`, `Plus`, `X`, `ExternalLink`, `Settings`, `LogIn`, `Repeat`, `ChevronDown/Up`, `ArrowLeft`, `ArrowRight`, `MoreHorizontal`, `AlertTriangle`, `LinkBreak`, `Lock`, `UserCheck`.

### 6.2 Components

| Component | Purpose |
|---|---|
| `<IntegrationsHeader>` | H1 + search input (live filter all sections) + "Request" button |
| `<EcodeManagedSection>` | Static table of 4 native services with "Open" buttons routing to existing IDE panels |
| `<ConnectorsSection>` | H2 + 2 tabs ("Used in this project" / "All connectors") + table with Name/Description/Trigger/Status columns |
| `<ConnectorRow>` | Logo + name + description + trigger icon (with hover tooltip) + action button (Sign in / Connect / Manage) |
| `<TriggerTooltip>` | Popover on Repeat icon hover (500ms delay), shows "Available automation triggers" list |
| `<McpServersSection>` | H2 + Beta pill + Learn more / Add MCP server buttons + table + feedback card |
| `<GitProvidersSection>` | H2 + 3-row table for GitHub/Bitbucket/GitLab |
| `<ManageConnectorView>` | Full sub-page with Back button, two variants (Scopes pills for OAuth, Configuration form for API key), Connected Apps table |
| `<RequestIntegrationModal>` | 2 fields + 1000-char counter + Submit |
| `<ConnectMcpServerModal>` | Display name + URL + Advanced settings collapsible (custom headers) + Test & save (does not close on overlay click) |
| `<OAuthConsentModal>` | Logo e-code → ArrowRight → Logo provider + 3 sections (LinkBreak, Lock, UserCheck) + full-width Continue button |
| `<SetupApiKeyModal>` | Warning banner + Configure button → opens form modal |
| `<ApiKeyFormModal>` | Per-provider form (Twilio: SID + Auth Token; Sendgrid: API Key; etc.) |
| `<DisconnectConfirmModal>` | Destructive red Yes button, reused for all disconnect/delete flows |
| `<Avatar>` | Circular 24px, hash-based color, initials in white |
| `<ScopePill>` | Monospace, bordered, radius 6px |
| `<StatusActive>` | Green dot + "Active" text |
| `<BetaBadge>` | Pill #E0F2FE/#0369A1 |
| `<Toast>` | Bottom-right, dark, auto-dismiss 5s |
| `<EmptyState>` | 3 variants: "No connections in this project", "No Apps connected" (icon + 2 lines), "No results found" (search) |

### 6.3 UX behaviors

- Live search filters every section independently. Each section shows its own "No results found" empty state.
- Tab switch in Connectors re-renders only that table.
- Hover trigger icon → 500ms delay → tooltip with the connector's trigger list.
- Manage click → in-panel navigation to sub-view (not modal). Back button returns.
- Kebab `⋯` on Manage view → popover with red Delete → opens DisconnectConfirmModal.
- Escape closes all modals. Overlay click closes all except `<ConnectMcpServerModal>`.
- Loading state on action buttons: outline → solid blue with spinner.
- Toast notifications stack vertically at bottom-right.
- All destructive actions (Disconnect, Delete) go through the same red confirmation modal.

## 7. Agent layer integration

### 7.1 Detection
- `packages/agent-runtime/src/connectorDetection.ts` builds a keyword → provider map from `ConnectorCatalog`
- Hooks: `onPromptReceived(prompt)` and `onCodeGenerated(code)`
- Result fed into the agent system prompt

### 7.2 Dynamic tool registry
- At session start, query `ProjectConnectionLink` filtered by `forAgentUse=true` → expose those providers' tools
- Add MCP tools from `McpInstall` records linked to the project
- Git Providers are filtered out (`forAgentUse=false`)

### 7.3 Connection request flow
- Agent calls a tool requiring a non-linked provider → emits `connection_request` message → suspends loop → waits for `connection_resolved` event on Redis
- The chat UI renders `<ConnectionRequestCard>` with provider logo + reason + scope list + "Connect" button → popup → OAuth flow → callback closes popup with `postMessage` → resolves the resume token

### 7.4 Secret request flow
- For API-key connectors, agent emits `secret_request` → chat renders `<SecretRequestCard>` with masked input → user submits → stored in `ProjectSecret` → resume

### 7.5 Code generation pattern
- System prompt instructs the agent to use `@e-code/sdk` exclusively
- Generated code: `import { ecode } from '@e-code/sdk'; await ecode.slack.chat.postMessage(...)`
- Never `process.env.SLACK_TOKEN`, never raw `fetch` to provider APIs

### 7.6 Runtime error handling
- 401 / 403 from sidecar → emit new `connection_request` for reconnect
- 429 → exponential backoff, max 3 retries
- 5xx → 1 retry then surface error to user
- 402 (Agent Services credits exhausted) → emit text message with link to billing

### 7.7 Prompt injection scanner
- `packages/agent-runtime/src/promptInjectionScanner.ts` runs on every connector and MCP response
- Wraps detected patterns in `<untrusted_external_data>` markers
- Blocks and alerts on strong-signal patterns

### 7.8 Pause / resume
- Session state in Redis: `running | paused_for_connection | paused_for_secret | paused_for_consent | completed | failed`
- TTL 24h
- On resolution: Redis publish → worker pickup → resume

## 8. Security

- All tokens encrypted at rest via `encryptJson()` (AES-256-GCM, existing `packages/security`)
- OAuth state CSRF: reuses existing `signOauthState` / `verifyOauthState` helpers (`app.ts:3795-3826`) with the existing `OAUTH_STATE_SECRET` env var. The connector OAuth flow encodes `{provider, projectId, userId}` in the state payload; the existing 10min TTL and HMAC-SHA256 signature suffice. No new mechanism.
- Webhook signature verification per provider (Slack v0, Stripe `Stripe-Signature`, GitHub `X-Hub-Signature-256`), 5min anti-replay window
- Scope validation: trim whitespace, detect missing URL prefix for Google scopes, match against `availableScopes`, precise error messages
- Sidecar isolation: tokens never reach workspaces, every call ACL'd
- Rate limiting per `(userId, provider)` (Redis token bucket), per `(orgId, provider)` for Enterprise overrides
- Audit logging: every sidecar call inserts into existing `AuditLog` table with `action: 'connector.api_call'`. Automatic SIEM webhook delivery via existing `SiemWebhook` infrastructure (`app.ts:3057-3100`). Daily aggregation worker, S3 export for Enterprise.
- Prompt injection: scanner on all tool responses

## 9. Plan gating

| Feature | Free | Pro | Enterprise |
|---|---|---|---|
| e-code managed (DB, Storage, Auth, Domains) | ✓ | ✓ | ✓ |
| External integrations (BYOK key as project secret) | ✓ | ✓ | ✓ |
| Connectors OAuth | — | ✓ | ✓ |
| Connectors API-key (Sign in) | — | ✓ | ✓ |
| MCP Servers catalog | — | ✓ | ✓ |
| Custom MCP server | — | ✓ | ✓ |
| Multi-account per provider | — | ✓ | ✓ |
| Reconnection alerts | — | ✓ | ✓ |
| Git Providers | ✓ | ✓ | ✓ |
| Custom OAuth app override | — | — | ✓ |
| Per-group RBAC connector policies | — | — | ✓ |
| Audit log export | — | — | ✓ |

Middleware `requirePlan(request, ['pro' | 'enterprise'])` on gated routes.

## 10. Webhook + worker layer

Workers (Node cron or Redis-scheduled):

| Worker | Frequency | Job |
|---|---|---|
| `tokenRefresher` | 5 min | Refresh tokens expiring within 1h |
| `tokenHealthCheck` | 30 min | Lightweight ping per provider, detect revoked-at-provider |
| `reconnectionAlertNotifier` | 10 min | Email + in-app notification for unresolved alerts |
| `auditLogAggregator` | daily 3am UTC | Aggregate by (user, project, provider, day) |
| `auditLogExporter` | daily 4am UTC | S3 export for Enterprise orgs |

## 11. Migration of legacy state

- One-shot script reads `VIBECORE_INTEGRATIONS_STATE` env var per project
- For each `integrations[id].connected === true` entry with a non-empty `INTEGRATION_TOKEN_<ID>` secret: create a placeholder `UserConnection { provider, status: 'needs_reconnect', forAgentUse: true }` plus `ProjectConnectionLink`
- The placeholder has no real token — surfaces a reconnection alert prompting the user to redo the OAuth flow once
- `integrationsState.webhooks[]` and `apiKeys[]` are preserved as features inside the Manage sub-view
- After migration, the legacy env var key is deleted

## 12. Environment variables — new

```
# OAUTH_STATE_SECRET — ALREADY EXISTS, reused as-is
CONNECTOR_PROXY_INTERNAL_URL             Sidecar URL (internal DNS)
CONNECTOR_PROXY_JWT_SECRET               Shared workspace ↔ sidecar JWT secret

# Per-provider default OAuth app (Vibecore-managed default credentials)
GITHUB_CLIENT_ID
GITHUB_CLIENT_SECRET
GITHUB_WEBHOOK_SIGNING_SECRET
SLACK_CLIENT_ID
SLACK_CLIENT_SECRET
SLACK_SIGNING_SECRET
NOTION_CLIENT_ID
NOTION_CLIENT_SECRET
GOOGLE_OAUTH_CLIENT_ID
GOOGLE_OAUTH_CLIENT_SECRET
STRIPE_OAUTH_CLIENT_ID
STRIPE_OAUTH_CLIENT_SECRET
... (one set per supported OAuth provider)
```

These are app-owner credentials registered with each provider's developer console. Callback URL configured on the provider side: `https://app.e-code.ai/integrations/oauth/:provider/callback`. The e-code team owns these apps; users never see them unless they configure an Enterprise org override.

## 13. Catalog seed

Script `packages/database/prisma/seed-connector-catalog.ts` seeds `ConnectorCatalog` with the 39 Replit-style entries:

Figma, GitHub, Gmail, Sendgrid, AgentMail, Airtable, Asana, Basecamp, Box, Calendly, Confluence, Discord, Dropbox, ElevenLabs, GitLab, Google Calendar, Google Docs, Google Drive, Google Sheets, HubSpot, Intercom, Jira, Linear, Mailchimp, Microsoft OneDrive, Microsoft Outlook, Notion, Productboard, Resend, RevenueCat, SharePoint Online, Slack, Squareup, Teamwork, Todoist, Twilio, Twitch, Typeform, Zendesk.

Plus 3 Git Providers entries (GitHub, Bitbucket, GitLab) marked `section='git_providers'` and `forAgentUse=false`.

Plus 4 e-code-managed entries (Database, Project Storage, Auth, Domains) marked `section='managed'`.

Existing `McpCatalogEntry` is extended with `featuredForIdePanel=true` on 19 entries matching the Replit MCP list: Stripe, Linear, Notion, Sentry, Atlassian, Miro, PostHog, Amplitude, Mixpanel, Granola, Razorpay, Sanity, Wistia, Google Maps Platform, Squidler, Lazyweb, Twilio, Doola, Figma. New entries are inserted if not present.

## 14. Tests

Backend unit:
- `oauth.spec.ts` — state HMAC sign/verify, expiry, single-use
- `connectorProxy.spec.ts` — ACL (cross-user/project/org denied), token injection, 401 → reconnect, rate limit
- `webhookSignatures.spec.ts` — Slack, Stripe, GitHub valid/invalid signatures
- `scopeValidation.spec.ts` — trim, detect missing prefix, validate against catalog
- `oauthAppResolver.spec.ts` — fallback default → org override
- `tokenRefresher.spec.ts` — refresh success/failure
- `promptInjectionScanner.spec.ts` — true/false positive coverage

Backend integration (Postgres real, no mocks):
- Full OAuth GitHub flow: connect → callback → link → call via proxy → revoke
- Multi-project: same connection linked to 2 projects, isolation by link
- Cross-user/project/org isolation (verified before any feature ships)
- Enterprise role ACL: user with role key not in `allowedRoleKeys` denied

Gap tests to add (currently missing per audit):
- `stripe-webhook.spec.ts` — signature verification for the existing billing webhook (currently uncovered)
- `siem-webhook-delivery.spec.ts` — retry / failure paths for SIEM webhook delivery (currently uncovered)
- `saml-acs.spec.ts` — SAML assertion signature validation (currently uncovered)

Frontend unit:
- Render of each `<ConnectorRow>` state (Connect, Sign in, Active+Manage, needs reconnect)
- `<ConnectionRequestCard>` scope display + button → popup
- `<ReconnectionBanner>` visibility logic
- Empty states per section under search filter

E2E (Playwright + mock OAuth server):
- Connect GitHub end-to-end
- Reconnect after token expired
- "Use existing connection" links without re-OAuth
- Org admin sets up custom OAuth override → builder uses it
- Disconnect confirmation flow

Agent specs:
- `connection_request` emitted when keyword detected and provider not linked
- Pause / resume after `connection_resolved`
- Reconnect prompt when 401 received
- Prompt injection blocked
- SDK call generated correctly (snapshot)

## 15. Phases

The phasing was revised after the live audit of the 5 existing Settings tabs revealed that GitHub, Vercel, Supabase are partially or completely broken (missing backend routes), and all 5 store tokens in plaintext localStorage. The new IDE Integrations panel UI is delivered **last**, on top of a solid foundation. The first phases repair the existing surface.

### Phase 0 — Foundation (3-4 days)
- Prisma migration `0015_integrations_connectors`: 7 new tables (`ConnectorCatalog`, `UserConnection`, `ProjectConnectionLink`, `OrganizationOAuthAppOverride`, `OrganizationConnectorPolicy`, `ReconnectionAlert`, `IntegrationFeatureRequest`) + 1 column on `McpCatalogEntry` (`featuredForIdePanel`). The previously planned `ConnectionAccessLog` is dropped — audit goes into existing `AuditLog` via `packages/audit`.
- Seed `ConnectorCatalog` with GitHub entry only (Phase 1 first provider). Stub entries for the 4 other repaired providers (Vercel, Supabase, GitLab, Netlify) so their Settings tabs can refer to them.
- Reuse `signOauthState` / `verifyOauthState` from `app.ts:3795-3826` — no new state mechanism.
- Skeleton `services/connector-proxy/` with healthz, ACL middleware. Auth uses `hashToken` + `createOpaqueToken` from `packages/auth`. Permission check uses `hasPermission` from `packages/rbac`. Audit writes via `packages/audit` AuditSink to existing `AuditLog`. Rate limits enforced via `assertWithinQuota` from `packages/quota` through existing `ensureQuota` middleware.
- Skeleton `packages/connector-sdk/` with type generator reading from `ConnectorCatalog`. Naming convention: NO `Mock|mock|InMemory|stub|fake|scaffolded` per `scripts/check-no-runtime-mocks.mjs`. Use `RecordingAdapter` / `OfflineAdapter` if test-double behavior is needed in production code.
- Chat message types (`connection_request`, `secret_request`, `connection_resolved`, `connection_failed`) added as Vercel AI SDK **data parts** annotated on the existing `Message` stream (no fork of runtime-contract). Type definitions co-located in `app/lib/chat/connector-messages.ts`.
- Connector detection + emission hooked into `app/lib/.server/llm/agent-orchestration.ts:293` (`executeAgentOrchestration`) — the actual e-code agent loop. NOT in `services/workspace-agent/` which is the workspace-side runtime.
- Workers (`tokenRefresher`, `tokenHealthCheck`, `reconnectionAlertNotifier`) added as modules consumed by existing `services/worker/src/index.ts` (118 lines).
- Cross-user / cross-project / cross-org isolation tests — must be green before any feature ships.
- `pnpm run platform:verify` must pass (chains `platform:no-mocks` + lint + test + typecheck + build + infra:validate).

### Phase 1 — Repair GitHub (1-2 weeks)
Repair the broken GitHub Settings tab by building it on top of the new `UserConnection` infrastructure. This validates the whole connector pattern (OAuth, sidecar, encryption, audit, reconnect) on one provider before generalizing.

- Real GitHub OAuth flow (`POST /api/integrations/oauth/github/connect`, `GET /integrations/oauth/github/callback`)
- Implement missing routes: `/api/github-user`, `/api/github-stats` — now backed by `UserConnection`
- Token storage: encrypted in `UserConnection.accessTokenEncrypted` (no localStorage)
- Connector-proxy wires the GitHub provider: `POST /proxy/:userConnectionId/repos/...` forwards to `api.github.com` with injected `Authorization`
- Refactor `GitHubTab.tsx` (282 lines) to consume `UserConnection` via `/api/account/connections?provider=github` — UI mostly unchanged, only the data source swaps
- Webhook receiver for GitHub events at `/webhooks/github` with HMAC-SHA256 verification (reuse SIEM webhook pattern) + idempotency table mirroring `StripeEvent`
- Agent message types `connection_request` and `connection_resolved` wired through chat
- Tests: E2E GitHub OAuth, refresh, revoke, sidecar ACL, cross-user isolation, webhook signature verification

### Phase 2 — Repair Vercel + Supabase + GitLab + Netlify (1-2 weeks)
Apply the same pattern to the remaining 4 Settings tabs.

- Vercel: implement `/api/vercel-user` + missing metric endpoints (deployments, domains, team, bandwidth). Refactor `VercelTab.tsx` to consume `UserConnection`.
- Supabase: implement `/api/supabase`, `/api/supabase/variables`, `/api/supabase-user`. Refactor `SupabaseTab.tsx`. The UI is rich but completely broken today — this delivers actual functionality.
- GitLab: migrate `GitLabTab.tsx` from localStorage to `UserConnection`. Supports self-hosted GitLab URLs via `UserConnection.metadata.baseUrl`.
- Netlify: migrate `NetlifyTab.tsx` from localStorage + cookie to `UserConnection`. Provider is already working — this is a security upgrade, no functional regression.
- Each tab keeps its specialized UI (it has substantial domain logic). Only the auth/storage backend swaps.
- Multi-account UX for tabs that support it (e.g. multiple Netlify teams).
- Tests for each: unit + integration (one test file per provider).

### Phase 3 — New IDE Integrations panel UI (~2 weeks)
Now that the data layer is solid (Phases 0-2 deliver real `UserConnection` for 5 providers), build the Replit-parity 4-section panel as a NEW surface in the IDE.

- Full panel UI: 4 sections (e-code managed, Connectors, MCP Servers Beta, Git Providers) with the design system from §6
- 5 modals (Request, Connect MCP, OAuth consent, Setup API key, Disconnect confirm)
- Manage sub-view (Scopes / Configuration variants + Connected Apps)
- Live search across all sections
- Trigger tooltips
- Empty states
- Wire MCP Servers section to existing `McpCatalogEntry` with new `featuredForIdePanel` filter
- Add Notion as first OAuth provider exclusive to the new panel (validates the catalog UX with a "fresh" provider)
- Add 4-5 more OAuth providers: Slack, Linear, Jira, Google Drive, Calendar
- Add 5 API-key connectors: Sendgrid, Resend, Twilio, ElevenLabs, AgentMail
- Agent `secret_request` message + renderer + pause/resume
- Reconnection alerts (worker + banner UI)
- Workers: `tokenRefresher`, `tokenHealthCheck`
- Account-level view `/account/connections` (cross-project view, separate from Settings tabs)
- Migration script for legacy `VIBECORE_INTEGRATIONS_STATE` → `ProjectConnectionLink` placeholders
- Settings tabs (Phases 1-2) link to the new IDE panel via the existing `ConnectionsTab` navigation hub — coexistence preserved

### Phase 4 — Long tail + Enterprise + extras (~2-3 weeks)
- Long tail OAuth connectors (~20 remaining from the 39-entry Replit catalog)
- Custom MCP server modal + subscription (`McpInstall` with `customDisplayName` + URL)
- Enterprise: custom OAuth app wizard 5-step + scope validator (`OrganizationOAuthAppOverride`)
- Enterprise: per-role RBAC connector policies (`OrganizationConnectorPolicy.allowedRoleKeys`)
- Audit log export S3 + Worker (reuse existing `AuditLog` aggregation, no new table)
- Plan gating middleware enforced (`requirePlan` reuses `ensureQuota` patterns)
- Optional: data warehouse connectors (Snowflake, BigQuery, Databricks)
- Data warehouse connectors (Snowflake, BigQuery, Databricks) — if scope confirms

## 16. Platform admin page (`/admin/integrations`)

A dedicated admin surface for the e-code team to manage the connector catalog, default credentials, MCP catalogue, webhook secrets, usage and audit — without redeploying. Access gated by `User.platformAdmin = true` (column exists at `packages/database/prisma/schema.prisma`).

All admin write actions log to the existing `AdminAuditLog` table (`schema.prisma:551-559`) via `packages/audit` AuditSink. Critical action keys (`admin.connector.credentials.rotate`, `admin.connector.disable`, `admin.mcp.add`) are added to `criticalAuditActions` in `packages/audit/src/index.ts` so they are forwarded to enterprise SIEMs.

### 16.1 Route structure

```
/admin/integrations                      → overview dashboard
/admin/integrations/connectors           → catalog table
/admin/integrations/connectors/:provider → edit single connector
/admin/integrations/connectors/new       → add new connector
/admin/integrations/mcp                  → MCP catalog table
/admin/integrations/mcp/:slug            → edit MCP entry
/admin/integrations/mcp/new              → add new MCP entry
/admin/integrations/webhooks             → signing secrets + delivery health
/admin/integrations/usage                → cross-org usage stats
/admin/integrations/audit                → connector audit log viewer
/admin/integrations/feature-requests     → user-submitted requests
/admin/integrations/org-overrides        → read-only view of enterprise OAuth overrides
```

Backend routes mirror this structure under `/api/admin/integrations/*`, each guarded by `requirePlatformAdmin(request)` middleware (new — wraps an existing `User.platformAdmin` check).

### 16.2 Sub-pages

**Overview dashboard**
- KPIs: total connectors enabled, active connections last 24h, OAuth refresh failures last 24h, top 5 providers by call volume, pending feature requests count
- Recent admin actions (last 20 from `AdminAuditLog` filtered by action prefix `admin.connector.*` or `admin.mcp.*`)
- Health alerts: any provider with > 10% 401/403 in last hour → red badge

**Connectors catalog table**
- Columns: Logo, Provider key, Display name, Category, Auth type (OAuth | API key), Section (connectors | git_providers | managed), Plan tier, Featured, Enabled toggle, Connected accounts count, Actions
- Row hover reveals: Edit, Test connection, Rotate secret, View stats, Disable, Delete (with confirm)
- Filter bar: by category, auth type, section, plan tier, enabled/disabled
- Search by provider key or display name

**Add / Edit Connector form**
- Identity: provider slug (unique), display name, description, category dropdown, logo URL
- Auth: type selector (OAuth | API key)
  - **If OAuth**: authorize URL, token URL, revoke URL (optional), user info URL, default scopes (multi-input with chips), available scopes (multi-input — for Enterprise scope picker), default Client ID (text), **default Client Secret** (password input, write-only — encrypted on save via `encryptJson()`, never returned in GET responses; display shows `••••••••` + "Rotate" button)
  - **If API key**: field schema (JSON editor: array of `{name, label, type: 'text' | 'password', required, placeholder}`), test endpoint URL
- Triggers: multi-input list of trigger IDs + map of `{triggerId: human label}` for the hover tooltips
- Webhook: signature scheme dropdown (slack_v0 | stripe_v0 | github_hmac_sha256 | hmac_sha256_generic | none), webhook signing secret (write-only password input)
- Plan & visibility: min plan tier dropdown, `forAgentUse` toggle, `section` dropdown, display order (number), `featuredForIdePanel` toggle (for catalog ordering)
- Test connection button: triggers a one-shot OAuth dry-run (or API key validation) using a test account configured at platform level. Reports success/failure inline.
- Save → upsert in `ConnectorCatalog`, audit log

**Rotate secret modal**
- For any provider with a stored secret (Client Secret or webhook signing secret)
- Two-input form (new secret + confirm), warning "rotating immediately invalidates the previous secret — existing webhook deliveries with the old signature will fail until providers update"
- On save: re-encrypt with `encryptJson()`, write to `ConnectorCatalog.defaultClientSecretEnc` or equivalent, emit `admin.connector.credentials.rotate` audit event

**MCP catalog table**
- Columns: Logo, Slug, Display name, Category, Featured for IDE panel, Install count, Verified badge, Actions
- Edit modal for each `McpCatalogEntry` (`schema.prisma:927-950`): name, description, category, transport, configTemplate JSON, configSchema JSON, version, `featuredForIdePanel`
- Add new MCP entry form
- Verify ownership flow (mark `verified = true` after manual review)

**Webhooks page**
- Per provider: current signing secret (masked), rotate button, last successful delivery timestamp, failure count last 7 days
- Recent webhook deliveries table (timestamp, provider, status code, response time, error if failed)
- Replay button on failed deliveries (re-emits the stored payload to the receiver)
- Reused from existing SIEM webhook delivery patterns at `app.ts:3057-3100`

**Usage stats**
- Daily aggregate of `AuditLog` rows where `action LIKE 'connector.api_call.%'`
- Charts: per-provider call volume, per-org call volume, 401/403 rate, average latency from `ConnectionAccessLog` metadata
- Aggregation done by existing `services/worker/src/index.ts` daily job, results in a new materialized view or aggregate table (cache layer, not new schema)
- Export CSV

**Audit log viewer**
- Filtered `AuditLog` table with `action LIKE 'connector.%'` OR `action LIKE 'admin.connector.%'`
- Filters: provider, org, actor, action, date range
- Export to CSV / NDJSON
- Click row → detail drawer with full metadata + IP + user agent

**Feature requests**
- Table from `IntegrationFeatureRequest` model (created in §4 schema)
- Per row: requested name, use case, requesting user, status, date
- Status transitions: pending → reviewed → approved | declined
- "Approved" auto-creates a stub `ConnectorCatalog` row with `enabled = false` so the team can finish configuring it
- Email notification to requesting user on status change (uses existing email service)

**Org overrides (read-only)**
- List of all `OrganizationOAuthAppOverride` rows configured by Enterprise orgs
- Columns: Org, Provider, Configured by, Configured at, Test status, Last error
- Click → detail view (Client ID visible, Secret masked, scopes shown). Helps the e-code team support Enterprise customers when their custom OAuth app misbehaves.
- No edit (orgs manage their own); admin can only force-disable with a comment.

### 16.3 New backend routes

```
GET  /api/admin/integrations/overview              → KPIs payload
GET  /api/admin/integrations/connectors            → list
GET  /api/admin/integrations/connectors/:provider  → details (secrets masked)
POST /api/admin/integrations/connectors            → create
PUT  /api/admin/integrations/connectors/:provider  → update (secrets only if provided)
POST /api/admin/integrations/connectors/:provider/rotate-secret
POST /api/admin/integrations/connectors/:provider/rotate-webhook-secret
POST /api/admin/integrations/connectors/:provider/test
DELETE /api/admin/integrations/connectors/:provider
GET  /api/admin/integrations/mcp                   → list McpCatalogEntry
POST /api/admin/integrations/mcp                   → create
PUT  /api/admin/integrations/mcp/:slug             → update
DELETE /api/admin/integrations/mcp/:slug
GET  /api/admin/integrations/webhooks/deliveries   → recent + failed
POST /api/admin/integrations/webhooks/replay/:deliveryId
GET  /api/admin/integrations/usage                 → aggregates
GET  /api/admin/integrations/audit                 → filtered AuditLog
GET  /api/admin/integrations/feature-requests      → list
PUT  /api/admin/integrations/feature-requests/:id  → update status
GET  /api/admin/integrations/org-overrides         → cross-org read
PUT  /api/admin/integrations/org-overrides/:orgId/:provider/force-disable
```

All routes guarded by `requirePlatformAdmin(request)`.

### 16.4 Security

- Every write action checks `request.currentUser.platformAdmin === true` (existing field)
- Every write action requires recent admin reauth (last 15min, pattern reused from SIEM webhook creation at `app.ts:6729-6752`)
- Secrets are write-only in the API: response always masks `defaultClientSecretEnc`, even to platform admins. Only the rotate flow lets them set a new value.
- Audit log every admin write with full before/after metadata (redacted via `redactAuditMetadata`)
- IP allowlist enforcement honored (existing `isIpAllowed()` in `packages/security`)

### 16.5 Frontend

New Remix routes under `app/routes/admin.integrations.*`:
- `admin.integrations._index.tsx` — overview dashboard
- `admin.integrations.connectors._index.tsx` — catalog table
- `admin.integrations.connectors.$provider.tsx` — edit form
- `admin.integrations.connectors.new.tsx` — create form
- `admin.integrations.mcp.*` — MCP screens
- `admin.integrations.webhooks.tsx`
- `admin.integrations.usage.tsx`
- `admin.integrations.audit.tsx`
- `admin.integrations.feature-requests.tsx`
- `admin.integrations.org-overrides.tsx`

Components shared with the org-admin pages (Phase 4 Enterprise) — single `<ConnectorForm>` reusable for both platform admins (configures defaults) and Enterprise admins (configures overrides).

### 16.6 Phase placement

This admin page is delivered incrementally:

- **Phase 0**: data layer ready (`ConnectorCatalog` table, encrypted secret columns) — no UI yet
- **Phase 1**: minimal admin view-only page listing the GitHub seed entry, no edit (we ship the connector via seed scripts)
- **Phase 2-3**: read + edit + add UI as more providers come online and the team needs to manage them without code changes
- **Phase 4**: full admin (usage stats, audit, feature requests, org-overrides view, webhook replay)

A new seed script `packages/database/prisma/seed-connector-catalog.ts` runs in CI and is the source of truth for initial connector entries. The admin page lets the team add ad-hoc entries without redeploying for the long tail.

## 17. Open decisions

### Resolved (this chantier)
- ✅ **Coexistence strategy**: Settings tabs and IDE Integrations panel coexist. Source of truth = `UserConnection` table consumed by both.
- ✅ **Repair scope**: GitHub / Vercel / Supabase / GitLab / Netlify are repaired BEFORE the new IDE panel is shipped (Phases 1-2). The new panel comes in Phase 3.
- ✅ **First provider**: GitHub (repairs the broken Settings tab + validates the connector pattern).
- ✅ **Audit log strategy**: existing `AuditLog` + `SiemWebhook` delivery — no new `ConnectionAccessLog` table.
- ✅ **OAuth state HMAC**: reuse existing `signOauthState` / `verifyOauthState` (`app.ts:3795-3826`).
- ✅ **`McpInstall` per-project scoping**: already supported (`projectId` column at `schema.prisma:990`).
- ✅ **RBAC for Enterprise connector policies**: use `allowedRoleKeys` (matching existing `Role.key` + `CustomRole.key`) — Vibecore has no Groups table.

### Still open (to confirm during implementation)
1. **GitHub agent OAuth scope** — `read:org`, `read:user`, `read:project`, `repo`. Confirm scope set before deploying the Phase 1 OAuth app.
2. **Webhook host strategy** — `/webhooks/:provider` path on `api.e-code.ai`. Confirm vs. a dedicated `webhooks.e-code.ai` subdomain.
3. **MCP merge strategy** — extending existing 22 entries with up to 19 additional curated entries; some overlap (Linear, Notion, Figma, Twilio). Confirm dedup logic.
4. **Plan tiers** — Free/Pro/Enterprise matrix in §9. Confirm against the live `Plan.key` seed data.
5. **SDK naming** — public `@e-code/sdk`, internal `@vibecore/connector-sdk`. Confirm.
6. **AI Model BYOK location** — out of this panel; lives in agent settings or AI Gateway config. Confirm separate chantier.
7. **OAuth app credentials per provider** — for Phase 1, the e-code team must register a GitHub OAuth app at `https://github.com/settings/applications/new` with callback `https://app.e-code.ai/integrations/oauth/github/callback` and provide `GITHUB_CLIENT_ID` + `GITHUB_CLIENT_SECRET` + `GITHUB_WEBHOOK_SIGNING_SECRET` env vars before Phase 1 ships.

## 18. Cross-references

- `docs/MCP_MARKETPLACE.md` — existing MCP infra (reused)
- `docs/STRIPE_WEBHOOKS.md` — billing webhook pattern (reused for connector webhooks)
- `docs/GITHUB_INTEGRATION.md` — existing git provider (parallel to new connector use)
- `docs/IDE_PANEL_AUDIT.md` — current Integrations row reads "Partial"; this plan lifts it to "Complete"
- `docs/AI_GATEWAY.md` — AI Model BYOK lives there, not in this panel
- `docs/AUTH_RBAC.md` — `requireProject` / `requireOrg` middleware used throughout
- `packages/security/src/index.ts` — `encryptJson` / `decryptJson` used for every encrypted column
- `packages/workspace-sdk/src/index.ts` — HMAC JWT pattern reused for sidecar auth
- `packages/audit/src/index.ts` — `AuditSink`, `redactAuditMetadata`, `criticalAuditActions` used for every connector audit insert
- `packages/auth/src/index.ts` — `hashToken`, `createOpaqueToken` used for sidecar JWT
- `packages/quota/src/index.ts` — `assertWithinQuota` used via existing `ensureQuota` middleware for plan gating
- `packages/rbac/src/index.ts` — `hasPermission`, `requirePermission`, `PermissionKey` used for connector RBAC
- `app/lib/.server/llm/agent-orchestration.ts` — the actual e-code agent (`executeAgentOrchestration`), where connector detection + connection_request emission hooks in
- `app/lib/chat/` — existing chat module where connector message renderers and data-part handlers live
- `services/worker/src/index.ts` — existing background worker where new connector workers (token refresh, health check, reconnection alerts) plug in
- `scripts/check-no-runtime-mocks.mjs` — CI-enforced banned-identifier scanner; every new non-test file must comply
