# Dedicated bounded package installation v1

Packages API uses a token-authenticated `/packages/v1/install` agent endpoint. It accepts only packageManager, packages, dev and timeoutMs; no command/argv, environment, cwd, background mode or session identifier. Both API and agent validate the existing package-spec grammar, including limits and option/shell injection rejection. Previously accepted named alias/source selectors remain accepted. Specs are separate argv entries, not shell commands. This is not a claim that dependencies or their lifecycle scripts are harmless: installation retains existing lifecycle behavior inside the same workspace process group and resource limits.

The explicit install ceiling is300000ms. API rejects larger budgets and the agent revalidates that cap, using the same command runner and process slots/abuse checks as other commands. Generic `/commands/run` keeps min(requested, WORKSPACE_COMMAND_TIMEOUT_MS), default30000ms; caller-supplied install fields cannot change it. Background sessions retain their separate existing policy and are not used by Packages.

Before any install dispatch, API reads `/packages/v1/capabilities` and requires exact version1, maxBudgetMs300000, validatedSpecs1. Old/mismatched agents receive PACKAGE_INSTALL_CAPABILITY_REQUIRED before mutation. No generic-command downgrade, local fallback or mutating retry is allowed. A successful capability read is not proof that a later dispatch executed: transport loss is an unknown outcome and must never trigger replay. This sync contract has no durable job/resume promise.

## Budgets and cancellation

- Command: requested budget at most300s, TERM at deadline, existing process-group KILL5s later.
- Explicit stop of a dedicated install: TERM, KILL after5s if still running, bounded10s confirmation window; only observed close means stopped. Generic stops retain their old5s window and existing escalation options.
- Capability hop: at most10s, inside the total installation transport deadline.
- Capability plus install hops: requested+30s, at most330s total from before capability. POST gets only the remaining budget, including token/fetch/body. Native AbortSignal.any in the existing API timeout wrapper preserves caller cancellation after headers, through response body consumption.
- Disposable runtime router: only exact POST `/packages/v1/install` gets330s upstream response inactivity budget. Other HTTP paths/methods, WebSocket paths and120s request-body reception budget stay unchanged.
- Web panel: existing360s signal passed to enterprise-api.server and retained through response.text; default ordinary30s remains unchanged. The360s includes API permission/manifest preparation before capability dispatch. There is no new claim that arbitrary manifest discovery always fits remaining overhead. If the outer connection is lost while work may have started, UI records unknown outcome; do not repeat the install. The process is still bounded by the agent deadline.

API project/workspace write permissions, workspace/project match, terminal revocation and abuse gates remain before dispatch. Workspace provisioning/quota/resource configuration is unchanged. Agent auth requires the same workspace-bound token; capabilities are not public health endpoints. Long installs count as active transient processes for the existing busy guard. Installation success still requires an observed zero exit without timeout/signal; it does not independently prove module importability.

Roll out agent capability before relying on the API route; mixed or stale agents fail clearly rather than silently switching policies. Required validation includes old-agent/invalid-capability refusals, spec/option injection, generic-negative budgets, process limits, TERM/KILL and explicit cancellation, lost response/body deadline, public diagnostic exclusion, full CI and real fresh install/import smoke in the disposable runtime. No extra paid service or credential is introduced.

## Existing running workspaces

Deploying main updates the workspace-agent image reference for future lifecycle operations; it does not prove existing workspace pods have changed image. The deployment path has no chart-service rollout for workspaceAgent. An existing agent without v1 capability therefore remains blocked with the explicit upgrade-required error. This patch does not restart/recreate pods, migrate running processes, destroy workspaces, or perform a hot upgrade. A separately authorized workspace start/reprovision can apply the new image and preserves the existing PVC, but may restart the container and interrupt its processes. Do not claim existing running agents are upgraded merely because the API/main deployment passed. Validate fresh disposable/new workspaces first and schedule any existing-workspace lifecycle separately.

Explicit cancellation is reported only for the dedicated installation result. A graceful exit code 0 following a requested stop remains observed as 0, with termination interrupted and success false; no OS signal is invented. Generic command result shapes are unchanged.
