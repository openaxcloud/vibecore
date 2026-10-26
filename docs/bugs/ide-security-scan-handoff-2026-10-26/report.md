# Security scan request lifetime during IDE shell replacement

Base: PR #808, 65228339e3bb74a64f672e8c3d1ca67ba5ed0d95. Local isolated worktree only.

## Reproduction

The original security-timeout case passed once locally on the baseline. A deterministic barrier on the real fixture GET ide-state then reproduced the missing progress element: PendingComposerShell is replaced by ChatImpl while a controlled security POST is running. DOM shell1/form2/progress3 became shell4/form5/no progress before the 90-second deadline. The durable regression test also fails on baseline immediately after history hydration. No manual CI retry was requested.

CI #808 primary shard1 had one failed case and two failed automatic retries. Other shard successes do not waive this failure.

## Correction

A transient provider inside the existing project/workspace/window scope owns the request, controller, fixed deadline, progress and terminal outcome. Shell/panel remounts subscribe to that same state. A second click cannot submit twice. Explicit cancel and scope exit abort local waiting, invalidate late responses and clear timers; no backend cancellation is claimed. Moving to another panel within the same scope keeps the scan running. Completed/failed responses refresh the current panel once per revision, including later reopening; they never call a discarded shell callback. Refresh exceptions do not change the recorded scan outcome. The completed message does not claim refreshed results.

## Validation completed before build

36/36 tests: session 11, provider 5, existing overlay 13 and AST 7. Targeted ESLint and web TypeScript pass. Includes backwards clock monotonic progress, late responses, one POST, timeout deadline across subscriptions, scope cancellation, current-owner refresh, sync/async refresh error containment.

## Limits

Synthetic local accounts/projects only. Real API history requests; controlled scan response/clock for UI contract. No scanner/runtime/provider execution, customer data, production browser session, physical Safari, DNS or deployment verification. No commit/push/merge performed by this agent.

## Final compiled verification

Single build exit0, source hashes unchanged. Browser7/7 passed in32.3s, zero retries: original timeout and two original failed-response cases, plus timeout/completed/failed/cancelled after true history handoff. Root independent review favorable. WEB5203 and shared fixture API/PG/Redis stopped after tests; unrelated services untouched.

## Follow-up: existing operation harness (168a6798)

Production CI run [40289211604, job 121460046100](https://github.com/openaxcloud/vibecore/actions/runs/40289211604/job/121460046100) rejected head 168a6798: six failures in `security-scan-operation.spec.ts` (`ReferenceError: scanSession is not defined`), alongside 10429 passing and 4 skipped tests. The original local 36-test selection had omitted this existing AST harness. Local reproduction then failed all six cases for the same reason.

The harness still extracts and executes the real `BaseChat` scan/cancel callbacks, but now supplies the real `createSecurityScanSession` and observes its actual request promise and transport signals. All six race scenarios and terminal/refresh assertions remain. The restarted-request case additionally checks exactly two requests, an aborted old signal and a distinct non-aborted new signal. No product code, timeout, retry policy or test expectation was removed to obtain a pass.

The final targeted group passes 84/84 across nine files: existing operation 6, session 11, provider 5, overlay 13, AST 7, font-size 2, scanner state 16, scanner commands 9 and findings route 15. ESLint, Prettier and the web TypeScript check pass. A repository-wide search found no other test harness referencing the removed `scanAbortRef` or `PROJECT_SECURITY_SCAN_TIMEOUT_MS`, and no other extractor of `ProjectSecurityPanel`. This test-only follow-up does not repeat the previous successful browser build/recipe and does not turn the rejected CI run into a successful one; a new exact-head CI result remains necessary.
