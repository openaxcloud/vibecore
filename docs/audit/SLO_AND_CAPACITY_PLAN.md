# E-Code Gate 1 SLO and Capacity Plan

## Status

| Field | Value |
|---|---|
| Repository | `openaxcloud/vibecore` |
| Audited code commit | `8a93e995b37de513a142acaf41fed364787c5e4e` |
| Gate | Gate 1, read-only source audit |
| Capacity verdict | **BLOCKED — no exact-commit executed staging load report found** |
| Overall verdict | **NOT_READY** |
| SLO status | **Proposed discussion targets only; not adopted, not measured, not promised** |

This plan does not convert thresholds found in source or documentation into production claims. `docs/SLOS.md`, Prometheus rule files and `docs/DISASTER_RECOVERY.md` contain intended thresholds/objectives, but no exact-SHA baseline demonstrates them. The historical `docs/PRODUCTION_READINESS.md:21-24,74-110` also records missing load and managed-restore evidence, but it reviewed another commit.

Deployment topology and operational commands are sourced from [`docs/DEPLOY_RUNBOOK.md`](../DEPLOY_RUNBOOK.md). The runbook describes the real deployment path; it is not a capacity report.

## Gate 1 observations

### Signals represented in code

- `/ready` probes PostgreSQL and Redis and returns 503 on failure (`services/api/src/app.ts:8660-8727`).
- Request/correlation IDs are assigned at API ingress (`services/api/src/app.ts:8276-8309`).
- `packages/observability/src/index.ts` exposes counters, gauges and histograms, but the registry is in-process.
- Candidate Prometheus alerts exist under `infra/observability/prometheus/alert-rules.yaml`.
- Load-source scenarios exist under `tests/load/` for API, billing webhook, preview, workspace lifecycle and simulated AI.
- Workspace pod specs declare requests/limits and probes (`packages/k8s-client/src/index.ts:645-735`).
- Runtime terminal and watch sockets use bounded exponential backoff; the collaboration client remains unbounded and resets after immediate open (`app/lib/collaboration/projectCollaborationClient.ts:362-485`).

### Evidence gaps

- No raw exact-SHA k6 report, browser trace, DB/Redis profile, node saturation trace or cost report was found.
- No evidence establishes that Prometheus assets are installed or that every replica is scraped and fleet-aggregated.
- Terraform monitoring still includes a disabled placeholder email and placeholder host (`infra/terraform/modules/monitoring/main.tf:1-52`).
- The synthetic health route itself returns constant `ok`; the external script also checks `/ready`, so only the combined script is meaningful (`services/api/src/app.ts:8742-8750`; `scripts/synthetic-health-check.mjs`).
- No measured safe concurrency, autoscaling lag, queue bound, connection-pool headroom or storage IOPS ceiling is attached to the commit.
- No measured p50/p95/p99 exists for workspace cold/warm start, terminal, edit-to-preview or agent first token/full task.

## SLI definitions

An SLI is valid only if numerator, denominator, exclusions, unit, labels and aggregation are versioned. Tenant/project identifiers, file paths, prompts and secret-like values must not be metric labels.

| SLI | Definition | Required source | Invalid shortcuts |
|---|---|---|---|
| API availability | Successful eligible requests / all eligible requests at ingress; exclude explicit client 4xx, include platform 429 caused by capacity | ingress + API request counter, deduplicated by request ID | `/health` alone; one replica's in-memory registry |
| API latency | Ingress receipt to response completion, by route class and status; p50/p95/p99 | ingress/API histogram with trace exemplars | mean latency; synthetic home page only |
| Auth availability | Successful valid-credential auth/session operations / valid attempts | auth outcome counter with safe reason class | counting attacker-invalid passwords in SLO denominator |
| Workspace start success | Workspaces reaching agent-ready and terminal-capable / accepted start operations within the observation window | durable lifecycle events + manager/Kubernetes state | DB status `RUNNING` or pod created alone |
| Workspace cold/warm latency | Accepted start to agent-ready, split by new pod/PVC/image pull versus wake of retained workspace | lifecycle timestamps and trace | client spinner duration without backend correlation |
| Terminal latency | Client input timestamp to corresponding PTY output acknowledgement, excluding user command execution time | sampled client/server monotonic timestamps | WebSocket open latency only |
| Edit-to-preview latency | Durable file save/version to expected content visible through routed preview | file version, runtime event, proxy and browser beacon | port ready or HTTP 200 without expected DOM |
| Preview availability | Authorized requests returning expected app/proxy behavior / eligible preview requests | ingress/proxy metrics and readiness beacon | blank HTTP 200 considered success |
| Collaboration delivery | Ordered document/comment event observed by every authorized active participant / published events | broker sequence IDs and client acknowledgement/resync | local API-replica send success |
| Agent first-token latency | Accepted run to first user-visible model token, separated by queue and provider | durable run/queue/provider/client timestamps | provider time alone |
| Agent task success | Runs satisfying task acceptance and ending non-cancelled / eligible runs, with human/evaluator policy version | agent run result plus acceptance evidence | HTTP 200 or model stop reason alone |
| Deployment success | Immutable artifact reaches verified READY endpoint with expected content / accepted deploys | release manifest, workload imageID, readiness and external probe | DB status READY alone |
| Rollback success | Previous verified release digest restored and externally serves expected bytes / attempted rollbacks | release manifests, digest, endpoint probe | Helm command exit without content verification |
| Billing webhook processing | Valid signed event reaches durable completed effect within threshold / valid signed events | Stripe event/effect state machine | HTTP 200 before non-idempotent effect completes |
| Billing accuracy | Reconciled expected charge equals ledger/invoice/entitlement outcome | independent usage/payment source and double-entry ledger | absence of customer complaint |
| Restore success | Isolated restore passes manifest/schema/tenant and critical-journey checks / scheduled drills | restore evidence manifest and raw timestamps | backup job success or teardown success |

## Candidate targets for validation — not commitments

The following numbers are starting hypotheses for a staging measurement campaign. They are not current SLOs and must not be copied into sales, status, pricing, parity or production-readiness claims. A target becomes adoptable only after at least two representative test runs, one failure run, owner approval, alert validation and an error-budget policy.

| Journey / SLI | Candidate target for discussion | Current measured baseline | Activation condition |
|---|---|---|---|
| API availability | `>= 99.9%` monthly for eligible requests | UNKNOWN | 30-day fleet telemetry plus dependency-failure drill |
| API read latency | p95 `<= 500 ms`, p99 `<= 1.5 s` | UNKNOWN | Route-class histogram under target concurrency |
| API mutation latency, excluding long async work | p95 `<= 1 s`, p99 `<= 3 s` | UNKNOWN | Trace proves async work is not hidden in response |
| Workspace start success | `>= 99%` accepted starts reach agent-ready | UNKNOWN | Real cluster lifecycle test including concurrent start |
| Warm workspace wake | p95 `<= 20 s`, p99 `<= 45 s` | UNKNOWN | Retained PVC/image path measured separately |
| Cold workspace start | p95 `<= 60 s`, p99 `<= 120 s` | UNKNOWN | Cold node/image/PVC path and capacity wait measured |
| Terminal interactive latency | p95 `<= 150 ms`, p99 `<= 400 ms` in test region | UNKNOWN | PTY echo probe through real ingress/WebSocket |
| Durable edit-to-preview | p95 `<= 3 s`, p99 `<= 8 s` for scoped Node fixture | UNKNOWN | Browser asserts expected DOM, not just HTTP 200 |
| Collaboration event delivery | p95 `<= 500 ms`, loss `0` after bounded resync in test scope | UNKNOWN | Two replicas and Redis interruption test |
| Agent first token | p95 `<= 5 s` excluding user approval pauses | UNKNOWN | Queue and provider latency split; provider scope fixed |
| Agent full task | No numeric target until task classes and evaluator are frozen | UNKNOWN | Stable fixture suite and success definition |
| Deployment success | `>= 99%` for supported fixtures; verified endpoint within p95 `<= 10 min` | UNKNOWN | Digest-exact publish and readiness/content checks |
| Rollback success | `100%` in scheduled drill scope; p95 `<= 10 min` | UNKNOWN | Destination digest before READY and failure drills |
| Valid Stripe webhook completion | `>= 99.9%` within `60 s`; no duplicate entitlement | UNKNOWN | Test-mode concurrent/partial-failure suite |
| Scheduled restore drill | `100%` of scheduled drills produce verified report | UNKNOWN | Real Postgres/PVC/GCS isolated restores |

These targets intentionally separate supported fixtures and test region. Language/framework, geography, provider and project-size matrices must be frozen before extending them.

## Proposed error-budget policy — inactive until SLO adoption

1. Compute availability budget from eligible events, not synthetic success alone.
2. Maintain separate budgets for API, workspace start, preview, deployment, collaboration, agent and billing; one healthy surface cannot hide another.
3. Any confirmed cross-tenant leak, double entitlement, ledger imbalance, unverified rollback or unrecoverable data loss is a security/integrity incident and consumes the entire release budget regardless of request availability.
4. At 50 percent budget consumption: review top contributors and freeze discretionary reliability regressions.
5. At 80 percent: stop risky launches in the affected domain and require an approved recovery plan.
6. At 100 percent: block rollout except an incident fix; perform counter-audit before resuming.
7. Error-budget exclusions require an auditable policy version; provider failure is not automatically excluded if E-Code promises fallback or recovery.

## Capacity model to measure

No numerical capacity claim is possible until the variables below are measured. The model must report both resource ceiling and admission-safe ceiling.

### API and shared services

```text
safe API concurrency
  = min(
      API pod CPU-limited concurrency,
      API pod memory-limited concurrency,
      PostgreSQL effective connection headroom / connections per request,
      Redis throughput and connection headroom,
      ingress active connection headroom,
      downstream provider quota / amplification factor
    ) * validated safety factor
```

Measure:

- request rate and in-flight requests by route class;
- CPU, RSS/heap, event-loop lag, GC pause and open handles per API replica;
- DB pool size, checkout wait, active/idle connections, query p50/p95/p99, locks, deadlocks, WAL and storage latency;
- Redis connections, command latency, memory, evictions, pub/sub backlog and reconnect rate;
- ingress active/idle/WebSocket connections, upstream latency, response bytes and 4xx/5xx;
- retry amplification per original request and idempotency-key collision/replay counts.

### Workspace runtime

```text
admission-safe workspaces per pool
  = min(
      allocatable CPU / measured CPU request plus system reserve,
      allocatable memory / measured memory request plus system reserve,
      pod/IP/PVC limits,
      image-pull and storage attach throughput,
      manager/API/DB start-operation throughput
    ) - disruption and surge reserve
```

Measure cold and warm paths separately:

- queue wait, scheduler wait, image pull, PVC bind/attach, pod ready, agent ready, terminal ready and preview ready;
- active, starting, sleeping, failed and orphaned workspaces;
- node allocatable versus requested/used CPU and memory, pod/IP limits and disk pressure;
- PVC capacity, IOPS, latency, attach errors and zonal scheduling constraints;
- manager reconciliation duration, concurrent operations, API/Kubernetes errors and orphan cleanup;
- cost per workspace-minute split by active, idle, sleeping and failed start.

### Agent and model routing

- queue depth/age, active runs, tool-call concurrency and cancellation latency;
- input/output tokens, first token, provider latency, rate limits and retry amplification by provider/model/mode;
- process children, terminal output bytes and tool-result/context bytes;
- checkpoint/index/storage growth per run;
- cost per successful task and per failed/cancelled task;
- budget enforcement under two simultaneous agents for one user/organization.

### Storage and deployment

- project object count/bytes, GCS request rate, signed-upload bytes, lifecycle deletion lag and prefix-list pagination;
- PVC snapshot/archive size and duration;
- build queue, build duration, image size, pull latency, registry quota and seven-service rollout duration;
- deployment replicas, autoscale lag, request count, egress and scale-to-zero wake latency;
- retained artifact/SBOM/provenance storage and rollback availability.

## Experiment matrix

Every experiment must capture source SHA, infrastructure manifest digest, image digest, exact command, start/end timestamps, raw output, environment limits, cleanup receipt and artifact SHA-256.

| Experiment | Positive case | Failure/concurrency case | Required observations |
|---|---|---|---|
| API ladder | Increasing read/mutation traffic | DB slow query, Redis loss, one replica killed | throughput, p50/p95/p99, errors, pool wait, retry amplification |
| Auth/tenant | Valid login/session/API key | brute burst, revoked identity, cross-tenant IDs | rate limits, latency, audit, no existence leak |
| Workspace start | One cold and one warm fixture | 2, 10, then staged bursts; pod/node/manager loss | every lifecycle phase, success, orphan count, cost |
| Terminal | interactive PTY and resize | ingress flap, long command, huge output, reconnect exhaustion | input/output latency, memory, reconnect schedule, process cleanup |
| Preview | HTTP, WS, SSE, upload and streaming | multiple ports, collision, blank HTTP 200, proxy restart | expected DOM/content, latency, access control, error state |
| Collaboration | two users on two replicas | Redis loss, simultaneous edit, rollback/delete during edit | ordering, duplicates, loss, resync, reconnect load |
| Agent | fixed read/edit/test fixture | provider 429/timeout, blocked command, huge output, cancellation | queue, first token, tool latency, retries, cost, child cleanup |
| Billing webhook | valid signed events | concurrent duplicate, reordered event, crash after effect | completion, single entitlement, reconciliation, retry depth |
| Metering | one window per resource | overlapping sweeps and crash at each write | usage source, ledger, watermark, over/undercharge |
| GCS | upload/list/download/move/delete | >1000 objects, partial copy/delete, purge/upload race | bytes, ops, pagination, quota, physical disappearance |
| Deploy | supported static/server fixture | bad readiness, missing image/secret, interrupted manifest | digest, endpoint content, duration, rollback evidence |
| Restore | isolated Postgres/PVC/GCS restore | corrupt backup, missing object, migration mismatch | RTO/RPO, hashes, tenant checks, promotion refusal |

### Load stages

1. **Correctness smoke:** one user/tenant; all expected assertions and telemetry fields.
2. **Baseline:** fixed low load for at least 15 minutes after warm-up; establish distributions.
3. **Capacity ladder:** increase one dimension at a time until the first SLO candidate or dependency saturation point is crossed.
4. **Mixed workload:** representative API, workspace, preview, collaboration, agent and webhook proportions.
5. **Burst:** simultaneous workspace wakes, agents or webhooks with a cold autoscaler.
6. **Soak:** long enough to expose memory/connection/storage leaks and scheduled-job overlap.
7. **Failure:** repeat below safe load while removing Redis, slowing PostgreSQL, killing pods/nodes, rate-limiting provider and failing storage.
8. **Recovery:** stop new load, verify backlog drains, state reconciles, no duplicate billing and resources return below thresholds.

The next stage is forbidden if correctness assertions fail. A higher throughput result with lost collaboration events, blank previews, duplicate charge or orphaned workspace is a failure.

## Backpressure and retry requirements

- Bound every queue by organization and globally; expose depth, oldest age, rejected count and retry count.
- Admission must reserve quota/capacity atomically before expensive allocation.
- Exponential backoff requires jitter, maximum delay, attempt/time budget and cancellation.
- Retry only idempotent operations or operations protected by a durable idempotency key/effect state.
- Do not reset a WebSocket retry counter until the connection proves stable.
- Prevent retry storms when Redis, PostgreSQL, ingress, Kubernetes or a model provider fails.
- A poison job must move to a visible terminal state/dead-letter path without blocking the queue.
- Provider 429/timeout fallback must preserve billing/model policy and record the actual provider/rate-card version.
- User-facing async surfaces must expose queued/running/retrying/failed/cancelled states and recovery action.

## Required dashboards and alerts

Repository assets are insufficient until deployed and exercised. At minimum:

- API overview: availability, route-class p95/p99, in-flight, event-loop, DB/Redis pool and top error codes.
- Workspace lifecycle: queue and phase latency, failure reason, pod/node/PVC state, capacity and orphan count.
- Preview/terminal/collaboration: connection count, reconnect rate, broker health, delivery/resync failures and blank-preview beacons.
- Agent: queue age, first token, provider latency/error/rate limit, tool duration, cancellation and cost per successful task.
- Billing: webhook state, duplicate suppression, incomplete effects, ledger discrepancies, metering lag and spend-cap failures.
- Deployment: build/rollout duration, digest verification, readiness, rollback success and artifact retention.
- Storage/DR: bytes/objects, deletion lag, backup freshness, restore drill result and measured RTO/RPO.
- Security: auth failure/rate limit, IDOR denial, SSRF denial, secret-resolution failure, admission-policy violations and critical audit actions.

Alert acceptance requires a real test receiver, deduplicated notification, owner, severity, actionable summary, direct dashboard and a runbook that was exercised. Placeholder `docs.vibecore.local` runbook URLs and disabled notification channels are not accepted.

## Evidence artifact layout

Each executed experiment should produce a directory such as:

```text
docs/audit/evidence/<date>/<experiment-id>/
  manifest.yaml              # source SHA, images, infra versions, commands, owners
  raw/                       # k6, Playwright, kubectl, DB, Redis, Prometheus outputs
  metrics-summary.json       # calculated distributions and saturation points
  assertions.yaml            # positive, negative, concurrency and recovery verdicts
  screenshots-or-traces/     # when browser behavior matters
  cleanup.yaml               # cleanup performed after proof, never used as deletion proof
  SHA256SUMS
  independent-review.yaml
```

The evidence manifest must distinguish code commit, documentation commit, workflow run SHA, image digest, Helm revision and test artifact hashes.

## Adoption sequence

1. Deploy fleet telemetry and verify cardinality/redaction.
2. Freeze supported fixture, topology and workload definitions.
3. Run correctness smoke and repair any invariant failures.
4. Run baseline and capacity ladder twice on the same exact commit.
5. Run dependency and node failure experiments.
6. Propose final SLO values using observed distributions and cost/headroom.
7. Configure recording rules, error budgets, dashboards and alerts.
8. Exercise notification and runbooks.
9. Obtain owner and independent SRE approval.
10. Only then mark an SLO adopted and begin reporting it.

## Gate exit criteria

This plan remains **BLOCKED / IMPLEMENTED_UNPROVEN** until:

- raw reports exist for every critical experiment on one exact commit;
- p50/p95/p99 and error rates are calculated from fleet signals, not one process;
- safe concurrency, saturation point, autoscaling lag, retry amplification and cost are known;
- quota races, duplicate billing and collaboration loss are absent under concurrency;
- PostgreSQL, Redis, node, ingress, storage and provider failure/recovery are exercised;
- alerts are deployed and delivered to a real test receiver;
- proposed targets are reviewed and explicitly adopted;
- an independent reviewer reproduces the critical results.

Until those conditions pass, E-Code must not claim a numerical SLO, capacity tier, 1,000/10,000-user readiness or performance parity from repository assets alone.
