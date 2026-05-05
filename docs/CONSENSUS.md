# Parallel-Subagent Consensus

The `services/ai-gateway` `POST /v1/agent-runs` endpoint runs five role-scoped
sub-agents (architect, frontend, backend, devops, qa) in parallel and now runs
a consensus algorithm over their outputs before returning. This replaces the
previous naive concat aggregation, which left the main model to reconcile
contradictions on its own.

## Algorithms

All three implement the same `ConsensusEngine` interface and produce the same
`ConsensusOutput` shape (algorithm + outcome + per-claim votes + conflicts).

### `QUORUM` (default)

Threshold-based weighted voting. Each role is one voter; `threshold` defaults
to 0.66 (two-thirds). A claim passes when supporters/total ≥ threshold.

File claims are exempt from quorum — each role legitimately owns its
artifacts. File-overlap conflicts are surfaced separately by
`detectFileOverlapConflicts`. The agreement score averages over risk and
verification claims only, not file claims.

`rounds = 1`. Cheapest, fits the 5-role topology in vibecore.

### `BYZANTINE_PBFT`

Practical Byzantine Fault Tolerant consensus over the role outputs. Tolerates
`f` malicious / faulty roles among `3f+1` total. Runs three message phases —
pre-prepare → prepare → commit — and accepts a claim when at least `2f+1`
roles commit.

For 5 roles, `f = floor(4/3) = 1`, so `2f+1 = 3` matching commits are required.

`rounds = 3`. Use when stakes are high (e.g. production migrations) — set
`highStakes: true` in the run request to opt in via `selectAlgorithmForRequest`.

### `WEIGHTED_PLURALITY`

Same algorithm as `QUORUM` but with per-role weights. Defaults:

| Role      | Weight |
| --------- | ------ |
| architect | 1.5    |
| qa        | 1.3    |
| backend   | 1.2    |
| frontend  | 1.0    |
| devops    | 1.0    |

Caller-provided `roleWeights` override the defaults. Useful when the run
domain skews toward a particular discipline (e.g. weight `qa` higher when
asking for a refactor).

## Outcome

| Outcome     | Meaning                                                                |
| ----------- | ---------------------------------------------------------------------- |
| `ACCEPTED`  | All claims passed AND every role participated (no failures).           |
| `PARTIAL`   | Some claims passed; either ratio < threshold or one role failed.       |
| `REJECTED`  | No claims passed AND at least one role tried.                          |
| `ABSTAINED` | No claims emitted — sub-agents had nothing to vote on.                 |

## Conflict detection

`services/ai-gateway/src/consensus/conflict-detection.ts` flags four conflict
types regardless of algorithm:

- **`file-overlap`** — multiple roles claim the same file (case-insensitive,
  with `./` and `//` normalization). 3+ claimants → `high` severity.
- **`risk-disagreement`** — at least one role lists a risk that ≥ N other
  participating roles ignored. Defaults to `N=2`.
- **`verification-gap`** — non-failed roles that produced empty
  `verification[]`. All non-failed roles silent → `high` severity.
- **`role-failure`** — any sub-agent run that failed (HTTP, JSON parse, etc.).
  ≥ half of all roles failed → `high` severity.

## Persistence

When `DATABASE_URL` is set in the ai-gateway environment,
`PrismaAgentRunPersistence` writes one transactional row to each of:

- `AgentRun` — id, mode, status, planned roles, organizationId, timing.
- `AgentRunResult` (× N roles) — per-role status / summary / files / risks /
  verification / raw output.
- `ConsensusRecord` — algorithm, threshold, outcome, agreementScore, rounds,
  durationMs, claimVotes, conflicts, consolidated payload.

This makes runs auditable end-to-end: a customer can ask "why did this
parallel subagent run reject the deploy plan?" and we can replay the votes.

## Request shape

```ts
POST /v1/agent-runs
Authorization: Bearer <ECODE_SUBAGENT_EXECUTOR_TOKEN>

{
  "mode": "parallel-subagents",
  "roles": [...],
  "messages": [...],
  "organizationId": "...",
  "consensusAlgorithm": "QUORUM" | "BYZANTINE_PBFT" | "WEIGHTED_PLURALITY",  // optional
  "consensusThreshold": 0.66,                                                 // optional, [0,1]
  "highStakes": false,                                                        // optional
  "model": "...",
  "maxTokens": 1400
}
```

The response always includes `consensus` even when callers don't request a
specific algorithm — the executor falls back to `selectAlgorithmForRequest`.

## UI surface

`AssistantMessage.tsx` renders a `Consensus` block in the popover when an
`agentExecution` annotation carries a `consensus` object:

- algorithm name + outcome badge (color-coded: green/red/amber)
- agreement-percent and rounds
- expandable per-claim list with decision dot and supporters/total
- expandable conflicts list with severity dot

Annotation flow: `services/ai-gateway` → `agent-orchestration.ts`
`AgentExecutionResponse` (now typed with optional `consensus`) →
`api.chat.ts` writes `agentExecution` annotation → React component picks it
up via the data stream.

## Tests

- `services/ai-gateway/src/consensus/consensus.spec.ts` — 28 unit tests
  covering voting helpers, conflict detection, all three engines, edge cases
  (all roles failed, no opinions, divergent opinions), the factory, and the
  algorithm-selection heuristic.
- `services/ai-gateway/src/agent-run-persistence.spec.ts` — 2 integration
  tests against real Postgres covering atomic AgentRun + results +
  ConsensusRecord persistence including PARTIAL outcome with role-failure
  conflict propagation.

Both run via `pnpm --filter @vibecore/ai-gateway test`. Zero mocks.
