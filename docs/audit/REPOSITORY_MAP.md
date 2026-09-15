# Gate 1 — Repository Map

## Scope

- Audited repository: openaxcloud/vibecore
- Audited code SHA: 8a93e995b37de513a142acaf41fed364787c5e4e
- Audit mode: read-only inspection of the clean detached baseline
- Document classification: Gate 1 observation and proposal; not implementation proof
- Verdict ceiling: IMPLEMENTED_UNPROVEN. Nothing in this document is SIGNED_PROVEN.

This document must be read with the existing sources of truth:

- DESIGN_PROGRAM_MASTER.md and DESIGN_AUDIT_LIVE.md for design work;
- BUG_INVENTORY_LIVE.md for bugs;
- PLAN_REMAINING_UNIFIED.md for delivery planning;
- REPLIT_PARITY.md for functional and pixel parity;
- docs/DEPLOY_RUNBOOK.md for operations.

No state in those files was changed by this audit. Their three independent states remain
Dispatché, Codé (merged and pushed on main), and Testé live. A repository observation is
not a live test.

## Physical map — observed

The pnpm workspace includes apps/*, services/*, packages/*, and infra
(pnpm-workspace.yaml:1-5). The largest tracked areas at the audited SHA are:

| Area | Tracked files | Observed responsibility |
|---|---:|---|
| app | 1,685 | React Router/Bolt web application, IDE, SSR loaders/actions and API routes |
| docs | 1,502 | Runbooks, evidence archives, parity contracts and historical audits |
| public | 1,445 | Static and generated browser assets |
| services | 350 | Eight Node/Fastify/runtime services |
| packages | 239 | Shared TypeScript packages and Prisma database |
| apps | 114 | Admin, mobile, desktop and web workspace packages |
| infra | 105 | Helm, Kubernetes, Terraform, Docker, Cloud Build and observability |
| .github | 31 | Twenty-three workflows and CODEOWNERS |
| electron | 29 | Desktop main/preload integration |
| tests | 24 | Cross-cutting test fixtures and suites |

### Applications

| Application | Current observation | Evidence |
|---|---|---|
| Web/IDE | The root app is the production React Router and Bolt-derived IDE. It owns 438 route files, including 162 api.* route files. | app/routes; package.json:60-80 |
| Admin | Independent Vite application with build, typecheck and tests. | apps/admin/package.json |
| Mobile | Capacitor application targeting Android and iOS. | apps/mobile/package.json |
| Desktop | Package delegates to the Electron implementation at repository root. | apps/desktop/package.json; electron/ |
| apps/web | Workspace facade delegating all scripts to the root web app. | apps/web/package.json |

### Services

| Service | Observed responsibility | Key evidence | Gate 1 status |
|---|---|---|---|
| API | Main application control plane: identity, organizations, projects, imports, Git, IDE state, runtime, agent, deployments, storage, databases, billing and admin. | services/api/src/server.ts:6-10; services/api/src/app.ts (34,212 lines, 470 HTTP registrations); services/api/src/store.ts:1209; services/api/src/prisma-store.ts:239 | PARTIAL |
| Workspace manager | Owns WorkspaceRuntime orchestration and Kubernetes resources for workspaces, builds, server deployments, scheduled jobs and CNPG resources. | services/workspace-manager/src/app.ts:222-655; services/workspace-manager/src/manager.ts:285 | IMPLEMENTED_UNPROVEN |
| Workspace agent | Files, patches, commands, processes, ports, snapshots, metrics and terminal WebSockets inside a workspace. | services/workspace-agent/src/app.ts:709-1381 | IMPLEMENTED_UNPROVEN |
| Preview proxy | Routes preview and server-deployment traffic, including wake-up and private-port checks. | services/preview-proxy/src/app.ts:464-1922 | IMPLEMENTED_UNPROVEN |
| AI gateway | Provider routing, model health, chat completion and multi-agent execution. | services/ai-gateway/src/app.ts:25-322; services/ai-gateway/src/gateway.ts:97-153 | IMPLEMENTED_UNPROVEN |
| Worker | BullMQ consumers for workspace GC, retention, SIEM, metering, database maintenance and durable deployment jobs. | services/worker/src/index.ts:38-535; services/worker/src/deploy-jobs.ts:17-95 | PARTIAL |
| Connector proxy | Generic credential-isolating provider proxy, but absent from Helm and continuous deployment. The API separately implements connector proxying. | services/connector-proxy/src/app.ts:68-175; services/api/src/app.ts:11801-11984 | IMPLEMENTED_UNPROVEN |
| Screenshotter | Playwright capture service; built by the runtime pipeline but disabled in production values. | services/screenshotter/src/app.ts:79; infra/helm/platform/values-prod.yaml:312-327 | BLOCKED |

### Shared packages

The repository contains audit/auth/RBAC/security, billing/quota, database, runtime,
workspace, Kubernetes, editor/UI/theme, observability, SDK, connector and template
packages. The current package boundaries are useful seams, but they are not domain
boundaries: services can still import the shared Prisma client and write tables owned
nominally by another domain.

Important observations:

- packages/config/src/index.ts contains only an empty export and is not a configuration registry.
- packages/runtime-contract/src/index.ts:175 defines the RuntimeAdapter interface.
- packages/runtime-remote/src/index.ts:54 and packages/runtime-webcontainer/src/index.ts:176
  provide the remote Kubernetes and Bolt-compatible WebContainer implementations.
- app/lib/runtime/RuntimeAdapterProvider.tsx:66-109 selects the runtime without replacing
  the existing Bolt IDE.
- app/lib/stores/workbench.ts:201-206 composes preview, files, editor and terminal stores.

### Data

packages/database/prisma/schema.prisma contains 122 models and 85 migration directories.
The schema covers identity, organizations, projects, IDE/collaboration, runtime,
deployments, storage, connectors, AI, billing, audit and administration. Duplicate
migration prefixes exist for 0015, 0062, 0063 and 0081. There is no allocation registry
or exclusive migration owner in the audited repository.

### Infrastructure

- infra/helm/platform deploys web, admin, API, worker, AI gateway, workspace manager and
  preview proxy; screenshotter is disabled and connector-proxy is absent.
- infra/helm/workspaces-runtime and packages/k8s-client define gVisor scheduling,
  resource limits, PVCs and NetworkPolicy objects.
- infra/terraform declares network, Artifact Registry, IAM, Cloud SQL, Redis, storage,
  secrets, an application GKE cluster and a separate workspace GKE cluster.
- cloudbuild.yaml builds the full image set; deploy-main.yml uses tiered pipelines and
  intentionally preserves the old admin image tag.
- No tracked Nix derivation, flake or lock builds the shared Nix store. The repository
  consumes a prebuilt generation registry from Helm values.

## Logical ownership — current observation

The main API and its ApiStore form a broad monolith. Workspace-manager is the clearest
existing service boundary, but PostgreSQL ownership is shared:

- API accesses almost every domain;
- workspace-manager writes WorkspaceRuntime;
- worker writes audit, retention, notifications and connector state;
- AI gateway writes AgentRun, AgentRunResult and ConsensusRecord;
- connector-proxy writes connector, membership, notification and reconnect state.

This is evidence of current access, not evidence that every writer was found. The static
scan must be backed by runtime query tracing before any data separation.

## Proposed target map

Do not start with a big-bang service split. First turn the API into a modular monolith
with explicit modules and repositories for:

1. identity-access;
2. organizations-rbac;
3. projects-imports-git;
4. ide-collaboration;
5. workspaces-runtime;
6. agent-ai;
7. connectors-secrets;
8. databases-object-storage;
9. deployments-releases-domains;
10. billing-metering-ledger;
11. admin-audit-notifications-observability.

Keep one physical PostgreSQL cluster initially, but assign every table to exactly one
module. Cross-domain consumers use versioned APIs or outbox events. Preserve
RuntimeAdapter and both runtime implementations so the Bolt IDE remains functional
during migration.

## Known blockers

- The repository-wide platform verification cannot pass because
  infra/scripts/validate.mjs:51-52 requires two missing NetworkPolicy files.
- Formal service contracts are incomplete and pinned to older SHAs.
- The continuous production workflow does not build or roll out admin.
- Connector-proxy has no production deployment path.
- The declared separate workspace cluster is not wired to the in-cluster manager in
  repository configuration.
- Configuration and secrets are not typed or scoped per service.
- Live infrastructure, failure, concurrency and restore proofs remain outside this
  read-only map.

