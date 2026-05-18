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

Audit of the codebase before writing this plan revealed substantial existing infrastructure. The new work must integrate with it, not duplicate it.

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

### Auth + workspace middleware (reuse intact)
- `requireProject(request, store, projectId, permission)` — `services/api/src/app.ts:1405-1416`
- `requireWorkspace(request, store, workspaceId, permission)` — `services/api/src/app.ts:1622-1636`
- `requireOrg(request, store, organizationId, permissions)` — `services/api/src/app.ts:1359-1380`

Every new route below uses these — no bypass paths.

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
  accessLogs              ConnectionAccessLog[]

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

// === Enterprise: connector visibility + group ACL
model OrganizationConnectorPolicy {
  id                      String   @id @default(cuid())
  organizationId          String
  provider                String
  enabled                 Boolean  @default(true)
  allowedGroupIds         String[]
  rateLimitOverride       Int?
  createdAt               DateTime @default(now())
  updatedAt               DateTime @updatedAt

  organization            Organization @relation(fields: [organizationId], references: [id])

  @@unique([organizationId, provider])
}

// === Sidecar audit
model ConnectionAccessLog {
  id                  String   @id @default(cuid())
  userConnectionId    String
  projectId           String
  workspaceId         String?
  action              String                       // 'api_call' | 'token_refresh' | 'revoke' | 'reconnect' | 'webhook_received'
  method              String?
  path                String?
  statusCode          Int?
  agentSessionId      String?
  errorMessage        String?
  occurredAt          DateTime @default(now())

  userConnection      UserConnection @relation(fields: [userConnectionId], references: [id])

  @@index([userConnectionId, occurredAt])
  @@index([projectId, occurredAt])
}

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
4. `OrganizationConnectorPolicy` allows this provider for this org and the user is in `allowedGroupIds`
5. Rate limit OK (Redis token bucket per `(userId, provider)`)
6. Decrypt token via `decryptJson()`
7. Forward request, stream response
8. On 401/403 from provider: mark `UserConnection.status='needs_reconnect'`, create `ReconnectionAlert`, publish Redis event
9. Log to `ConnectionAccessLog`
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
- OAuth state CSRF: HMAC-signed token with new `OAUTH_STATE_SECRET`, cookie `vc_oauth_state` httpOnly/secure/sameSite=lax, 10min TTL, single-use nonce
- Webhook signature verification per provider (Slack v0, Stripe `Stripe-Signature`, GitHub `X-Hub-Signature-256`), 5min anti-replay window
- Scope validation: trim whitespace, detect missing URL prefix for Google scopes, match against `availableScopes`, precise error messages
- Sidecar isolation: tokens never reach workspaces, every call ACL'd
- Rate limiting per `(userId, provider)` (Redis token bucket), per `(orgId, provider)` for Enterprise overrides
- Audit logging: every sidecar call → `ConnectionAccessLog`, daily aggregation worker, S3 export for Enterprise
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
OAUTH_STATE_SECRET                       HMAC for OAuth CSRF state
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
- Enterprise group ACL: user outside `allowedGroupIds` denied

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

### Phase 0 — Foundation (3-4 days)
- Prisma migration: 8 new tables + 1 column on `McpCatalogEntry`
- Seed scripts: `ConnectorCatalog` (3 entries minimum: GitHub, Slack, Notion) + extend `McpCatalogEntry` with `featuredForIdePanel`
- Skeleton: `services/connector-proxy/` with healthz + ACL middleware (no providers wired yet)
- Skeleton: `packages/connector-sdk/` with type generator from catalog
- Skeleton: `packages/runtime-contract/` extensions (message type definitions)
- Design system tokens + atomic components (Button, Modal, Table, TabsUnderline, Pill, Toast, TooltipPopover)
- Cross-user/project/org isolation tests — green before any feature ships

### Phase 1 — MVP: 4-section panel + GitHub OAuth end-to-end (~2 weeks)
- Full panel UI refresh: 4 sections, search, modals, Manage sub-view, all empty states
- Generic OAuth routes (connect/callback/revoke/test/refresh)
- `connector-proxy` complete (ACL, logging, rate limit)
- GitHub connector wired end-to-end through SDK and proxy
- Webhook receiver for GitHub events
- Migration script for legacy `VIBECORE_INTEGRATIONS_STATE`
- Agent `connection_request` message + chat renderer + pause/resume
- Tests: E2E GitHub OAuth, isolation, CSRF, refresh

### Phase 2 — Connector breadth + API-key + Reconnection (~2 weeks)
- Add 10 OAuth connectors: Slack, Notion, Google Drive/Calendar/Sheets/Docs, Linear, Jira, HubSpot, Figma
- Add 5 API-key connectors: Sendgrid, Resend, Twilio, ElevenLabs, AgentMail (modals 4 + 6)
- 3 Git Providers fully wired
- Wire MCP Servers section to existing `McpCatalogEntry` with `featuredForIdePanel`
- Multi-account UX in `<ConnectorRow>`
- Reconnection alerts (worker + banner UI)
- Workers: tokenRefresher, tokenHealthCheck
- Agent `secret_request` message + renderer
- Account-level view `/account/connections`

### Phase 3 — Long tail + Enterprise (~2-3 weeks)
- Long tail OAuth connectors (~20 remaining)
- Custom MCP server modal + subscription
- Enterprise: custom OAuth wizard 5-step + scope validator
- Enterprise: per-group RBAC connector policies
- Audit log export S3 + Worker
- Plan gating middleware enforced
- Data warehouse connectors (Snowflake, BigQuery, Databricks) — if scope confirms

## 16. Open decisions

1. **GitHub agent OAuth scope** — agent connector wants `read:org`, `read:user`, `read:project`, plus `repo` for some flows. Confirm scope set with the user.
2. **Webhook host strategy** — `/webhooks/:provider` on `api.e-code.ai`. Confirm vs. a dedicated `webhooks.e-code.ai` subdomain.
3. **MCP merge strategy** — extending existing 22 entries with 19 Replit-style additions; some overlap (Linear, Notion, Figma, Twilio). Confirm dedup logic.
4. **Plan tiers** — Free/Pro/Enterprise matrix in §9. Confirm against the live billing plan keys.
5. **SDK naming** — public `@e-code/sdk`, internal `@vibecore/connector-sdk`. Confirm.
6. **AI Model BYOK location** — explicitly out of this panel; lives in agent settings. Confirm a separate chantier.

## 17. Cross-references

- `docs/MCP_MARKETPLACE.md` — existing MCP infra (reused)
- `docs/STRIPE_WEBHOOKS.md` — billing webhook pattern (reused for connector webhooks)
- `docs/GITHUB_INTEGRATION.md` — existing git provider (parallel to new connector use)
- `docs/IDE_PANEL_AUDIT.md` — current Integrations row reads "Partial"; this plan lifts it to "Complete"
- `docs/AI_GATEWAY.md` — AI Model BYOK lives there, not in this panel
- `docs/AUTH_RBAC.md` — `requireProject` / `requireOrg` middleware used throughout
- `packages/security/src/index.ts` — `encryptJson` / `decryptJson` used for every encrypted column
- `packages/workspace-sdk/src/index.ts` — HMAC JWT pattern reused for sidecar auth
