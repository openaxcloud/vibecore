# Git status repository preparation

Base: `4af4dd1a0ba14473affb2ee7fdeabbac23b1274f`. This change is independent of
PRs #748, #751 and #752 and does not change them. Only the API Git status path
prepares its repository once for its subsequent queries. Each new operation
still validates and repairs the repository, identity and workspace exclusion.
No persistent readiness cache, process timeout, security policy or test gate changes.

PR #749 reports request `edeec585-62ba-421d-80ef-edf7dab0bac4` at 8859.1 ms,
4861.8 ms inside the instrumented handler, and a 15.502 s CPU profile with
4179 ms in spawn through ensureRepository and 1332 ms through git. The PR body
was read; the raw CPU profile/stacks are not published there or available in
this workspace, so their attribution has not been independently reconstructed.
The repeated preparation is confirmed by code and real Git TRACE2 measurements.
This patch does not claim to resolve the full 8.86 s incident or editor flakes.

## Actual before/after workload

Local PostgreSQL on port 55438, isolated synthetic users/organizations/project,
real API HTTP requests, real disk and Git, 20 text files. Ten sequential rounds
each concurrently request Git status, ZIP and health. Each ZIP is decoded and
every file is compared. Both routes refuse the foreign organization with 404.
Stored archive bytes survive a new database connection; status and export also
succeed after closing and rebuilding the API. Created rows/files are cleaned.

| Measurement | Before | After |
| --- | ---: | ---: |
| Git child processes, 10 statuses | 120 | 60 |
| Repository probes | 30 | 10 |
| Identity configuration commands | 60 | 20 |
| Total measured workload ms | 1770.78 | 1084.82 |
| API process CPU user + system ms | 1496.57 | 968.21 |
| Status median / max ms | 170.94 / 221.00 | 105.03 / 136.12 |
| ZIP median / max ms | 58.47 / 105.37 | 52.37 / 73.72 |
| Health median / max ms | 9.70 / 32.04 | 7.91 / 14.85 |

Historical JSON receipts record exact production-source hashes but the checkout
was dirty, not a final committed SHA. Their first 30 results alone comprise the
measurement window; subsequent records are validation. CPU excludes child
process CPU. No latency assertion, artificial delay or original incident
reproduction is claimed. Host conditions can affect duration comparisons.

## Regression evidence and reproduction

`before-tests.json`: original production source, one failure and two successes.
The failure observes six repository probes for two statuses instead of two.
`final-tests.json`: 42 successes, zero skips, including four new real Git tests:
TRACE2 process count and actual edits, repair after repository removal, detached
HEAD, and repair of altered identity/deleted workspace exclusion. Existing
regressions cover workspaces, containment, editor saves, commits and routes;
their server test doubles are not PostgreSQL validation.

Run from services/api with the existing Vitest configuration:
`../../node_modules/.bin/vitest run --config vitest.config.ts src/git-status-preparation.spec.ts`.
The HTTP/PostgreSQL recipe is `src/git-status-load-proof.mts`, executed with tsx,
NODE_ENV=test and DATABASE_URL pointing exclusively to localhost:55438/panel_proof.
Supply an absolute JSON output path. Its final form explicitly separates
measurement and validation results and records checkout dirty status.

API typecheck passes. New-file lint passes. Targeted project-storage lint has
16 errors / 1 warning, exactly the same diagnostic multiset as the base (ignoring
shifted locations); no lint exemption added. Root lint covers app, not services.
No installed Git hook or hook bypass is involved. Final SHA and completed build,
root lint, scanner and CI results are reported separately in the draft PR.

If the repository disappears during one status operation, that call may fail;
the next call revalidates it. Concurrent repository mutation is not made atomic
by this change. Editor-level before/after validation remains coordinated work.
