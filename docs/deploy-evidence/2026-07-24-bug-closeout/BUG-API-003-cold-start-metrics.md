# BUG-API-003 — live proof: cold-start metric increments no longer 500

Root cause (original): `metrics.increment('workspace_cold_start_pending_total')` and
`workspace_cold_start_write_recovered_total` (services/api/src/app.ts) threw
`Unknown metric` because the counters were never declared in the
`@vibecore/observability` registry. The workspace pod was created, then the throw
turned the response into a 500 `API_ERROR` — the UI saw 500 instead of `starting`.

Fix (a41239eb / bdce73d0, live in prod SHA 6d57a401): both counters are declared
in `packages/observability/src/index.ts` `platformMetricDefinitions`.

## Proof 1 — deployed binary, executed INSIDE the running prod api pod
`kubectl exec` into `vibecore-vibecore-platform-api-*` (prod), ran the deployed
`@vibecore/observability` registry via the pod's own `tsx`:

```
{
  "results": {
    "workspace_cold_start_pending_total": "OK_NO_THROW",
    "workspace_cold_start_write_recovered_total": "OK_NO_THROW"
  },
  "control": "THREW_AS_EXPECTED: Unknown metric: definitely_not_a_metric_xyz",
  "node": "v22.23.1"
}
```

Both counters that previously threw now increment cleanly; the negative control
(an undeclared name) still throws `Unknown metric`, proving the guard is real and
these two names are genuinely registered — not silently swallowed.

## Proof 2 — organic prod traffic, no error signature
Scanned the last 20h of live prod api logs across all api pods:
- `Unknown metric` errors: **0**
- Pre-fix, EVERY cold-start workspace open emitted this error and 500'd.

Conclusion: the sole cause of the BUG-API-003 500 is eliminated in the running
production binary; the cold-start path now reaches its `return runtimeSession(..,
'starting', { provisioning: true })` instead of throwing.

Note: a synthetic end-to-end cold-open HTTP round-trip (minting a throwaway
user/org/role/project + a real workspace pod) was deliberately NOT run — it would
create disposable production resources and its <15s vs >15s cold-timing is
non-deterministic, while proving nothing beyond the two proofs above (if the
increment does not throw, the coded path returns `starting`).
