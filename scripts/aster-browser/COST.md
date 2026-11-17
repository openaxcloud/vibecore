# Baseline-only cost and evidence increment

No remote action has been authorized or performed by this increment. Apply after cookie/environment patch3008a809. Existing archives and the other #925 modes are preserved.

## Summary instead of artifact storage

For browser_baseline=true only, upload-artifact is skipped. The always-running summary step uses Python's standard library, so a dependency-install failure does not require pnpm/tsx to produce the summary. If checkout itself failed and the script is absent, the fallback writes a constant incomplete-checkout message. No raw stdout, browser content, exception text, credentials, project IDs, marker bytes or URLs enter the summary.

The renderer reads only fixed local JSON filenames, refuses symlinks/inputs over4096bytes, and emits at most2048UTF-8bytes of allowlisted fields: SHA40hex, last known stage from a fixed set, job/recipe/cleanup outcomes, registration and iframe assertion booleans, normalized UTC timestamps. A PASS requires all three outcomes to be success, the baseline success result and both assertions. Missing/corrupt evidence stays not confirmed; it cannot manufacture a pass. A stage checkpoint records progress even if no final result exists. Assertion files are updated only after the corresponding real Playwright assertions complete.

Raw diagnostics and browser attachments may still exist on the disposable runner and in normal job logs, but this mode uploads none as artifacts. The job summary does not pretend to replace those diagnostics with complete proof. Registration means the registration form completed and navigated to dashboard; preview means the expected unique marker rendered in the iframe under the authenticated context. New-volume reopening, direct pod bytes and AI remain untested.

The non-baseline upload condition remains effectively always(): missing/false browser_baseline enables the unchanged action, paths, name and retention. The other mode's result file and diagnostics are not altered. No cache action, package publication or paid external tracking is added. Local npm/browser/Docker caches on the runner are working disk state, not an upload to GitHub Actions cache storage.

## Static execution graph

At this local source revision:

- Exactly one job, private-runtime, runs on ubuntu-24.04, timeout90minutes. No matrix, reusable workflow, job container or extra service VM is configured. Docker/kind containers stay inside that one machine.
- A branch push to qa/aster-browser-baseline-20261115 (without a tag or PR) matches no workflow push trigger. The private recipe's old exact push branch remains unchanged. No PR or tag creation is included.
- One workflow_dispatch of the existing private-runtime-recipe.yml with browser_baseline=true selects only that job. The only workflow_run consumer in the repository listens for Production Docker on stable, not this recipe. Scheduled workflows are independent, not children of this dispatch. No deployment workflow is invoked.
- The three executed setup actions are pinned Node20 actions, not composites/reusable workflows: checkout11d5960a..., setup-node49933ea..., pnpm/action-setupb906affc.... Their pinned action.yml files were read from the official public repositories. setup-node's input cache is unset; its main saves cache state only when that input is nonempty and its post skips caching without that state. pnpm's pinned cache input defaults to false and is not overridden. upload-artifactea165f8... remains listed but its condition is false in baseline mode. No shared-cache write is configured.
- Job permissions remain contents:read; checkout does not persist credentials; no OIDC or external-secret input. Setup downloads are the previously documented official package/browser/client/image downloads, distinct from application traffic.

## Exact SHA and one-shot limitation

The proposed reference does not exist remotely as a consequence of this work. After separately authorized publication/review, resolve its current head to the approved full SHA immediately before the single official dispatch, check no equivalent run is queued/running, and confirm the returned run's head_sha equals that approved SHA. If the ref moves or schema acceptance fails, stop. The workflow dispatch accepts the reference; no invented SHA input or historical target bypass is added. One job per dispatch is statically established; preventing a human from dispatching/rerunning twice is not guaranteed by this patch. Do not retry automatically.

Using the requested public Linux x64 2-core rate assumption of USD0.006/minute: 90 ×0.006 = USD0.54 gross runner time before quota, for this one90minute run only. This is arithmetic under the supplied rate, not a billing quote or verified account limit. Actual runner sizing/eligibility, free quota, concurrency, spending limits and the final published graph must be checked before execution. No billing setting, account quota or charged usage was read or changed here. Extra dispatches/reruns would be separate consumption. Artifact upload and shared-cache upload for baseline are zero by the inspected graph.

## Local validation

Python summary tests pass2/2, including arbitrary-content rejection, bounds, missing/oversized evidence, cleanup failure and strict PASS conditions. Targeted ESLint and recipe TypeScript pass. Workflow YAML assertions confirm one standard job ≤90minutes, contents:read, conditional upload suppression, no cache action/configuration, no matching qa/ push and no subscribing workflow_run. No actual summary from a real baseline run exists yet. No cluster, browser, production action, push, dispatch, purchase or AI call occurred.
