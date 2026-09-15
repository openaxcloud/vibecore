# Gate 1 — Incremental Migration DAG

Audited baseline: 8a93e995b37de513a142acaf41fed364787c5e4e.

Status: PROPOSAL_ONLY. No migration in this document has been dispatched, merged,
pushed, tested live or SIGNED_PROVEN.

All later progress must be reflected in PLAN_REMAINING_UNIFIED.md and the relevant
design, bug and parity sources. The three states Dispatché, Codé and Testé live stay
independent.

## Dependency graph

    M0 Baseline and evidence manifest
     |
    M1 Governance, contracts, ownership and configuration schemas
     |
    M2 Compatibility façades and generated clients
     |
    M3 Internal API domain modules
     |\
     | M4 Data ownership, outbox and worker migration
     |/
    M5 Runtime boundary and cluster-topology reconciliation
     |
    M6 Agent/AI and connector ownership
     |
    M7 Per-service config, secrets, identities and network policy
     |
    M8 Complete CI/CD, Nix and supply-chain path
     |
    M9 Optional physical data separation after shadow validation
     |
    M10 Test environment canary, rollback and independent counter-audit

M5 and M6 may run in parallel after M3 if they do not edit shared contracts, Prisma
migrations or central manifests concurrently. M7 consumes their finalized config and
network contracts. M9 is optional and must not begin merely to make the source tree look
service-oriented.

## Work stages

| Stage | Objective | Primary files | Required guard | Rollback |
|---|---|---|---|---|
| M0 | Record exact SHA, repository state, evidence hashes and known failures. | docs/audit | Hash validation | Documentation-only revert |
| M1 | Create contract/config/data-owner registries, CODEOWNERS and dependency rules. | docs/audit, packages/config, .github/CODEOWNERS, lint/boundary scripts | Registries validate; no behavior change | Remove additive checks |
| M2 | Describe current HTTP/WS/queue behavior and generate clients behind existing façades. | packages/contracts, generated clients, service client adapters | Contract snapshot and compatibility tests | Switch consumers to legacy adapters |
| M3 | Move route business logic into internal application modules without changing routes. | services/api/src/modules, existing app/store façades | Golden route/error tests | Route façade invokes legacy implementation |
| M4 | Assign tables, add transactional outbox and remove cross-owner direct writes. | database schema/migrations, repositories, worker consumers | Migration rehearsal, idempotency and race tests | Stop new consumers; replay/compare outbox; retain old read path |
| M5 | Make workspace-manager the exclusive Kubernetes owner and reconcile cluster topology. | workspace manager, agent, k8s-client, runtime packages, workspaces chart/Terraform | kind/GKE test, fail-closed auth and network isolation | Per-project runtime flag back to prior topology |
| M6 | Make AI gateway and one connector broker authoritative. | ai-gateway, connector proxy/API connector module, generated clients | Provider failure, secret isolation and cancellation tests | Feature flag to prior API path; revoke temporary broker tokens |
| M7 | Apply typed configuration, per-service Secret/SA and narrow NetworkPolicy. | packages/config, Helm config/secrets/policies | Missing-secret and denied-egress tests | Restore previous secret mounts only for bounded rollback window |
| M8 | Cover admin and every enabled service in build/deploy/rollout; establish Nix build provenance and blocking supply-chain policy. | workflows, Cloud Build, Docker, Helm, Nix build source | Render, build, SBOM, signature, digest rollout and rollback | Roll back Helm revision and immutable image digests |
| M9 | Split physical stores only where ownership and load justify it. | Terraform, schemas, data migration jobs | Shadow reads, reconciliation, backup/restore | Stop cutover, return reads to source, retain replicated data |
| M10 | Exercise canary and failure paths, then independent review. | test environment and evidence only | Positive, negative, concurrency, idempotence, failure and restore proof | Abort canary and execute rehearsed rollback |

## Stage acceptance

Every stage requires:

1. full base and result commit identifiers;
2. explicit allowed and forbidden file lists;
3. positive and negative tests;
4. idempotence, concurrency and failure tests where applicable;
5. raw output and hashes;
6. rollback trigger and command;
7. no silently skipped required suite;
8. independent reviewer;
9. update of existing tracking sources without creating a second status system.

## Linearization and data rules

- Account/project deletion, secret rotation, deployment promotion, ledger posting and
  runtime start/delete require a documented linearization point.
- Destructive operations are fail-closed and idempotent.
- Dual-write is prohibited unless reconciliation and replay are designed first.
- Prefer transactional outbox plus idempotent consumers.
- Never delete the old field/table until the result SHA has restore proof and rollback
  no longer depends on it.
- The absence of a resource must be observed before test teardown.

## Current blockers before M1/M2 can be accepted

- infra/scripts/validate.mjs references two absent NetworkPolicy files.
- Formal service contracts are incomplete and pinned to historical SHAs.
- packages/config is empty.
- Migration prefixes are duplicated.
- Continuous deployment omits admin and connector-proxy.
- Runtime cluster topology is unresolved.
- Real Postgres, Kubernetes, object storage, browser, proxy, rollback and restore
  evidence is still missing for the target contracts.

