# Security scan request lifetime during IDE shell replacement

Base: PR #808, 65228339e3bb74a64f672e8c3d1ca67ba5ed0d95. Local isolated worktree only.

## Reproduction
The original security-timeout case passed once locally on the baseline. A deterministic barrier on the real fixture GET ide-state then reproduced the missing progress element: PendingComposerShell is replaced by ChatImpl while a controlled security POST is running. DOM shell1/form2/progress3 became shell4/form5/no progress before the 90-second deadline. The durable regression test also fails on baseline immediately after history hydration. No manual CI retry was requested.

CI #808 primary shard1 had one failed case and two failed automatic retries. Other shard successes do not waive this failure.

## Correction
A transient provider inside the existing project/workspace/window scope owns the request, controller, fixed deadline, progress and terminal outcome. Shell/panel remounts subscribe to that same state. A second click cannot submit twice. Explicit cancel and scope exit abort local waiting, invalidate late responses and clear timers; no backend cancellation is claimed. Moving to another panel within the same scope keeps the scan running. Completed/failed responses refresh the current panel once per revision, including later reopening; they never call a discarded shell callback. Refresh exceptions do not change the recorded scan outcome. The completed message does not claim refreshed results.

## Validation completed before build
36/36 tests: session11, provider5, existing overlay13 and AST7. Targeted ESLint and web TypeScript pass. Includes backwards clock monotonic progress, late responses, one POST, timeout deadline across subscriptions, scope cancellation, current-owner refresh, sync/async refresh error containment.

## Limits
Synthetic local accounts/projects only. Real API history requests; controlled scan response/clock for UI contract. No scanner/runtime/provider execution, customer data, production browser session, physical Safari, DNS or deployment verification. No commit/push/merge performed by this agent.

## Final compiled verification
Single build exit0, source hashes unchanged. Browser7/7 passed in32.3s, zero retries: original timeout and two original failed-response cases, plus timeout/completed/failed/cancelled after true history handoff. Root independent review favorable. WEB5203 and shared fixture API/PG/Redis stopped after tests; unrelated services untouched.
