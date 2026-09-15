# Gate 1 Architecture Decision — Contracts-first modularization

## Status

PROPOSED_PENDING_GATE_1_VALIDATION

Audited code SHA: 8a93e995b37de513a142acaf41fed364787c5e4e.

This decision records observed architecture and a proposed incremental target. It does
not authorize implementation, production changes or a parity signature. Nothing here is
SIGNED_PROVEN.

The delivery state remains governed by DESIGN_PROGRAM_MASTER.md,
DESIGN_AUDIT_LIVE.md, BUG_INVENTORY_LIVE.md, PLAN_REMAINING_UNIFIED.md and
REPLIT_PARITY.md. This ADR does not change Dispatché, Codé or Testé live.

## Context — observed

The repository already contains useful structural seams:

- a Bolt-derived IDE with WebContainer compatibility;
- a RuntimeAdapter contract with WebContainer and remote Kubernetes implementations;
- a workspace manager and in-workspace agent;
- dedicated preview and AI gateways;
- shared packages for auth, RBAC, billing, security and observability;
- Helm and Terraform infrastructure.

The seams do not yet form enforceable bounded contexts:

- services/api/src/app.ts contains most business orchestration and 470 route registrations;
- ApiStore and PrismaApiStore expose nearly all persistence behind one interface;
- several services write the same database domains;
- service HTTP, WebSocket and queue contracts are mostly informal;
- configuration is distributed across hundreds of environment reads;
- the continuous deployment topology does not match every service in the workspace;
- the dedicated Terraform workspace cluster is not wired to the deployed in-cluster
  manager in repository configuration.

## Decision — proposed

### 1. Preserve the existing IDE and runtime seam

Keep packages/runtime-contract as the stable IDE/runtime port. Keep both
runtime-webcontainer and runtime-remote. Do not remove or replace the Bolt IDE.

Workbench, files, editor, terminal, preview, diagnostics, processes, ports and Git should
converge on one coherent state model, but this consolidation must be incremental and
covered by UI and reconnection tests.

### 2. Build a modular monolith before extracting more services

Create internal API modules for identity-access, organizations-rbac,
projects-imports-git, IDE-collaboration, workspaces-runtime, agent-AI,
connectors-secrets, databases-storage, deployments-releases, billing-ledger and
admin-audit-notifications.

Keep current routes as compatibility façades while moving validation and business rules
into application services. Do not move files in bulk before contracts and dependency
tests exist.

### 3. Give every persistent model one owner

PostgreSQL remains physically shared initially. Every Prisma model receives one module
owner; other modules use the owner's API or versioned event. Workspace-manager owns
WorkspaceRuntime and Kubernetes resources. AI gateway owns provider invocation and
agent execution state. Billing owns ledger invariants. A single data agent allocates and
orders migrations.

Use a transactional outbox for cross-domain events. Consumers must be idempotent and
record processed event identifiers.

### 4. Contract every boundary

- OpenAPI for HTTP.
- JSON Schema or AsyncAPI for BullMQ and WebSocket messages.
- Generated clients instead of hand-copied UI/server enums.
- A common error envelope with stable code, retryability, correlation ID and safe detail.
- Explicit idempotency semantics for every mutating command.
- Version, owner, consumers and deprecation date recorded in CONTRACT_REGISTRY.yaml.

### 5. Resolve service duplication explicitly

Choose one credential-broker architecture:

- deploy connector-proxy as the sole provider proxy, or
- retain an API-owned connector module and retire connector-proxy after callers migrate.

Running both implementations indefinitely is rejected.

### 6. Make configuration typed and least-privileged

Implement packages/config as per-service schemas. Validate at process startup. Separate
public browser configuration from server secrets. Eliminate long-lived VITE access
tokens and localStorage credential ownership. Mount only the secrets and service
accounts each workload needs, and narrow NetworkPolicy selectors accordingly.

### 7. Reconcile runtime infrastructure

Decide and document one supported topology:

- dual cluster: workspace-manager authenticates explicitly to the workspace cluster,
  with tested failure and rotation behavior; or
- single cluster: remove the unused Terraform workspace-cluster contract.

No topology claim is accepted from Terraform alone.

### 8. Make delivery cover every enabled workload

Continuous deployment must build, pin and verify admin and every enabled service. A
service without a build, chart, rollout check and rollback path remains
IMPLEMENTED_UNPROVEN. Vulnerability gates, SBOM, provenance and signature policy must
be defined before a supply-chain signature.

## Bounded contexts

| Context | Owns | Public boundary | Forbidden dependency |
|---|---|---|---|
| Identity-access | users, sessions, MFA, OAuth/SSO/SCIM | auth commands and identity queries | direct session writes from other domains |
| Organizations-RBAC | orgs, membership, roles, invites | membership and authorization service | UI or service hard-coded permission authority |
| Projects-imports-git | projects, imports, templates, repository metadata | project/import/Git API | direct runtime or billing table writes |
| IDE-collaboration | IDE state, presence, comments | versioned IDE/collab messages | duplicated runtime/file state |
| Workspaces-runtime | WorkspaceRuntime, Kubernetes objects, PVC identity | manager HTTP/WS contract | Kubernetes mutation outside manager |
| Agent-AI | conversations, tools, routing, AgentRun | AI gateway contract | provider calls outside gateway |
| Connectors-secrets | connections, OAuth apps, encrypted secret references | credential broker | browser-held durable credentials |
| Databases-storage | project DBs, snapshots, objects | lifecycle commands | direct bucket/CNPG mutation outside owner |
| Deployments-releases | builds, manifests, domains, rollout state | immutable release commands | READY based only on a database row |
| Billing-ledger | subscriptions, usage, reservations, ledger | reserve/settle/reconcile | non-transactional balance mutation |
| Admin-audit-notifications | append-only audit, security events, notifications | admin query and event sinks | mutable audit history |

## Consequences

Positive:

- preserves working Bolt/WebContainer behavior;
- allows small, reversible migrations;
- makes concurrency, failure and idempotency testable at boundaries;
- reduces parallel-agent collisions;
- permits later service extraction based on measured load and transactional needs.

Costs:

- compatibility façades temporarily increase code;
- ownership migration requires query tracing and outbox infrastructure;
- generated contracts add versioning discipline;
- dual-read/shadow phases require observability and reconciliation;
- configuration and Helm changes require coordinated rollout.

## Alternatives rejected

- Big-bang repository reorganization: rejected because boundaries are not yet proven.
- Immediate microservice split: rejected because database and transaction ownership are
  still shared.
- Replacing Bolt/WebContainer: rejected by product invariant and because RuntimeAdapter
  already provides the appropriate seam.
- Keeping implicit TypeScript-only service contracts: rejected because external and
  queue consumers need compatibility and failure semantics.
- Treating tests or Terraform configuration as live proof: rejected by Gate 1 evidence
  policy.

## Validation required before acceptance

The decision may progress only after contract registry validation, import-boundary tests,
data-owner query tracing, migration rehearsal, real Kubernetes isolation tests, config
negative tests and an independent counter-audit on the exact implementation SHA.

