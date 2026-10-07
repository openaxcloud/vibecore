# Gate 1 — Dependency Graph

## Baseline and interpretation

- Audited SHA: 8a93e995b37de513a142acaf41fed364787c5e4e
- Classification: observed dependencies plus proposed guardrails
- Evidence type: repository manifests, imports, routes and infrastructure configuration
- No dependency in this document is SIGNED_PROVEN at runtime.

Tracking remains in DESIGN_PROGRAM_MASTER.md, DESIGN_AUDIT_LIVE.md,
BUG_INVENTORY_LIVE.md, PLAN_REMAINING_UNIFIED.md and REPLIT_PARITY.md. This document
does not change their Dispatché, Codé or Testé live states.

## Compilation graph — observed

    root web
      -> billing
      -> editor
      -> runtime-contract
      -> runtime-remote -> runtime-contract
      -> runtime-webcontainer -> runtime-contract
      -> workspace-sdk

    api
      -> audit, auth, billing, database, k8s-client
      -> observability, quota, rbac, security, sdk

    workspace-manager
      -> database, k8s-client, sandbox-runtime, workspace-sdk

    workspace-agent
      -> observability, runtime-contract, security, workspace-sdk

    ai-gateway
      -> database, security

    worker
      -> database, security

    connector-proxy
      -> connector-sdk, database, security

    sandbox-runtime
      -> k8s-client

No manifest-level cycle was found by the Gate 1 scan. This is not a proof that the
source import graph is acyclic. eslint.config.mjs:44-54 only forbids selected relative
imports; it does not enforce domain direction.

## Runtime and network graph — observed

    Browser / desktop / mobile
      -> React Router/Bolt web
          -> React Router api.* loaders/actions
          -> Fastify API
          -> WebContainer runtime, when selected

    Fastify API
      -> PostgreSQL through Prisma
      -> Redis for queues/rate limiting/collaboration paths
      -> workspace-manager
          -> Kubernetes API through kubectl
          -> workspace-agent pods on port 8080
          -> PVCs, Services, Deployments, Ingress and CNPG resources
      -> ai-gateway
          -> OpenAI/Anthropic/Gemini/OpenRouter/Mistral/Groq/xAI/Moonshot/Ollama
      -> GCS, Stripe, SMTP/HTTP email, OAuth and deployment providers

    preview-proxy
      -> workspace-agent previews
      -> server deployment Services
      -> workspace-manager wake-up
      -> API private-port authorization

    worker
      -> Redis/BullMQ
      -> PostgreSQL for selected jobs
      -> API internal routes
      -> workspace-manager GC

    connector-proxy
      -> PostgreSQL
      -> GitHub/GitLab/Bitbucket/Vercel/Supabase/Netlify

    screenshotter
      -> Chromium
      -> preview hosts, only when enabled

Evidence anchors include services/api/src/app.ts:6483-6923,12917-14454;
services/worker/src/index.ts:237-424; services/preview-proxy/src/app.ts:474-516;
services/ai-gateway/src/gateway.ts:97-153,1255-1451; and
packages/k8s-client/src/index.ts:35-102.

## Data graph — observed

    packages/database / Prisma schema
      <- API: broad read/write access
      <- workspace-manager: WorkspaceRuntime
      <- worker: audit, retention, notifications, connectors
      <- AI gateway: AgentRun, AgentRunResult, ConsensusRecord, org/user reads
      <- connector-proxy: connections, policies, membership, notifications

The physical database is therefore a shared integration layer. ApiStore is also a
central dependency: services/api/src/store.ts:1209 exposes a 2,705-line interface, and
PrismaApiStore at services/api/src/prisma-store.ts:239 implements it in 6,928 lines.

## Infrastructure graph — observed

    GitHub push main
      -> .github/workflows/deploy-main.yml
      -> Cloud Build tier pipelines
      -> Artifact Registry SHA tags
      -> fleet membership vibecore-prod-app
      -> helm upgrade vibecore / infra/helm/platform

    Terraform
      -> VPC
      -> Cloud SQL
      -> Redis
      -> object storage
      -> GKE application cluster
      -> GKE workspace cluster

    Helm workspace-manager
      -> in-cluster Kubernetes service account
      -> current cluster API

The final two paths do not join in repository configuration: Terraform declares a
dedicated workspace cluster, while continuous deployment and workspace-manager use the
application cluster membership and an in-cluster token. The applied topology is UNKNOWN.

## High-coupling nodes

| Node | Current coupling | Risk |
|---|---|---|
| services/api/src/app.ts | 470 HTTP registrations and most domain orchestration | Merge conflicts, broad blast radius and untestable ownership |
| ApiStore / PrismaApiStore | Nearly every domain and persistence operation | Cross-domain transactions and implicit contracts |
| schema.prisma and migrations | All persistent domains | Parallel agent collision and ordering ambiguity |
| app/lib/stores/workbench.ts | Runtime, files, editor, terminal, preview and Git concerns | UI state contradiction and merge hotspot |
| Helm values/configmap | Operational flags, URLs, secrets and image references | Configuration drift, especially with --reuse-values |
| deploy-main.yml | Tier detection, build and rollout selection | Silent omission of admin and undeployed services |
| docs/parity registries | Contracts and proof claims pinned to historical SHAs | Evidence can be mistaken for current truth |

## Implicit dependencies and drift

- UI copies server-owned RBAC, billing, environment and support enums:
  app/lib/rbac-catalog.ts:3-18; agentPowerEstimate.ts:3-17;
  projects.$projectId.env.helpers.ts:3-23; support.tsx:24-30.
- VITE access-token variables and browser localStorage connector stores retain a legacy
  client-credential dependency.
- Every platform pod receives the global platform Secret and AI shared Secret
  (infra/helm/platform/templates/deployments.yaml:98-109).
- NetworkPolicy permits broad intra-platform traffic and database/Redis egress to every
  pod (infra/helm/platform/templates/networkpolicy.yaml:67-95,139-172).
- The API implements provider proxying independently of connector-proxy.
- The repository has two API planes: React Router api.* and the Fastify API.
- Shared Nix generation metadata is consumed, but the derivation/build graph is absent.

## Proposed dependency direction

    UI -> generated client/contracts -> domain application layer
      -> domain repositories -> owned tables
      -> versioned outbox events -> worker consumers

    API -> versioned workspace-manager client -> runtime control plane
    API -> versioned ai-gateway client -> model providers
    API/runtime -> connector broker -> provider credentials

Rules proposed for Gate 2:

1. A domain may import its own application, domain and repository layers.
2. Cross-domain imports target public contracts only.
3. Only the owning repository imports a domain's Prisma delegates.
4. Worker jobs consume versioned commands/events and remain idempotent.
5. UI never imports server implementations or stores durable provider credentials.
6. Workspace-manager alone imports Kubernetes mutation clients.
7. AI gateway alone calls model-provider endpoints.
8. Central migrations, generated clients, registries and Helm files have one active owner.
9. Add source-graph cycle and boundary checks to CI.

## Proof still required

Runtime traces must confirm actual calls, database query logs must confirm all writers,
and a real test cluster must confirm network reachability and isolation. Until those
checks exist, this graph is an evidence-backed repository map, not a signed runtime
topology.

