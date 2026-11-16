# Connected, non-destructive browser baseline

This increment connects the previous browser/gateway patches to #925's existing guarded launcher. Base: 3f5ce0261a3b1fc97694f904555d6a6916922640. Nothing was published or executed remotely.

See ENVIRONMENT.md for the subsequent cookie-compilation and minimal-child-environment correction.

## What now runs when selected

The existing workflow gains one optional boolean `browser_baseline` (default false). No new workflow or push branch is added. Its launcher keeps the original GitHub-hosted, event, OS, generated kubeconfig/context and Docker ownership guards. Never fabricate GITHUB_* variables to execute it locally.

With the mode selected, `browserStack` clones the ordinary ephemeral manifests and adds the real `@vibecore/preview-proxy` Deployment and ClusterIP Service on3020. It uses the same local platform image (which already contains the real service and locked dependencies), default service account without an automounted Kubernetes token, and two freshly generated server-side keys. The manager, API and proxy share only the bench's local Secret. Tenant enforcement is enabled in both proxy and manager; private-port enforcement is enabled in the proxy. The API emits the exact loopback preview URL template. No credentials are printed or injected into the browser.

The launcher then forwards API3001, manager3010 and preview3020 only on127.0.0.1; runs the real React Router development compiler/server on5173 with explicit development mode, remote-kubernetes and `/api/runtime`, a minimal environment, an empty private HOME, local SAAS_API_URL and the fresh tenant key; waits for HTTP200 on/login; starts the tested loopback gateway; and launches the existing Playwright baseline-only mode. The normal IDE loader creates vc_preview. Web and preview use two exact loopback origins; runtime requests stay behind the web gateway.

Playwright success writes a result explicitly labelled authenticated-browser-baseline-only, podBytes not-inspected, volumeReplacement not-tested, aiGeneration not-tested. The branch returns before the old API validator. It never opens the host IPC replacement interface. Cleanup uses the original owned-cluster cleanup path after closing local processes/gateway; there is no explicit PVC DELETE or replacement in this increment. Whole disposable-cluster cleanup remains part of #925, not a workspace restoration experiment.

The fixture has no dependencies; the existing npm command includes --no-audit --no-fund. Browser external destinations and AI paths are blocked and provider credentials are rejected. Official dependency/image/browser downloads are setup requirements of a future runner, not external application test calls. No build or browser test against the real stack has been executed here.

## Exact future execution

Only after review and separate authorization to publish the complete patch chain to a dedicated reference, verify that the reference contains the input definition and has the intended SHA. Do not use the historical browser branch or the old automatic validation branch. Proposed reference: `qa/aster-browser-baseline-20261115` (not created).

The official one-shot dispatch would be:

```sh
gh workflow run private-runtime-recipe.yml \
  --repo openaxcloud/vibecore \
  --ref qa/aster-browser-baseline-20261115 \
  -f browser_baseline=true
```

No command above has been run. The workflow already exists on the default branch, but the added input exists only in this local patch. Confirm GitHub accepts the target ref's schema before dispatch; if it rejects the input, stop and report rather than substitute an event or alter guards. Confirm the actual run SHA and absence of an equivalent queued/running run before claiming execution.

Inside that official workflow, the exact launcher command is unchanged:

```sh
pnpm exec tsx scripts/private-runtime-recipe/run.ts
```

The workflow supplies PRIVATE_RUNTIME_BROWSER_BASELINE=1 and E2E_PROVIDER_MODE=absent when selected; its conditional Chromium installation uses the existing lockfile Playwright version. Do not invoke the launcher locally by impersonating a hosted runner.

Permissions and budgets to verify before any future remote action:

- Caller must be allowed to publish the reviewed test reference and dispatch Actions; job remains contents:read, checkout persist-credentials:false, no id-token permission, no external secret reference or cloud credential.
- Check repository Actions enablement, runner availability/concurrency, included minutes and spending limits, and artifact storage quota. No quota or account billing was queried in this lot. The existing job cap remains90minutes and evidence retention7days; this is a cap, not a measured duration or a guarantee of free minutes.
- Re-audit all workflows at the published SHA. At the local inspected base, push on the proposed qa/ reference matches none. PR creation would trigger CI/E2E and PR-related checks and is not part of this route. Tags can trigger release/Docker jobs and must not be used. The private recipe's old push filter remains exactly validation/private-runtime-20261113-7b970996. The only workflow_run consumer found is staging deployment for Production Docker on stable; it does not subscribe to this recipe. Scheduled jobs are independent and are not triggered by this dispatch.

## Local evidence and remaining blocker

Executed on Node22.23.5 / pnpm9.14.4 with already installed frozen dependencies:

```sh
pnpm exec eslint scripts/aster-browser/stack*.ts scripts/private-runtime-recipe/run.ts
pnpm exec tsc -p scripts/private-runtime-recipe/tsconfig.json
pnpm exec vitest run scripts/aster-browser/stack.spec.ts scripts/aster-browser/baseline-policy.spec.ts scripts/private-runtime-recipe/checks.test.ts
```

Final exits0; 10 tests passed. Initial lint errors (cross-directory imports and formatting) and one test expectation incorrectly treating the Namespace itself as namespaced were corrected; no rule/test was disabled. A scripts-only @recipe alias was added to the root and recipe TypeScript configurations to satisfy the repository import rule and keep tsx/vitest resolution consistent. YAML was parsed and trigger definitions audited locally; this is not GitHub schema acceptance.

The local kind ip6tables blocker remains, and no cluster retry/system/network change was made. No already configured non-kind stack with a real Kubernetes workspace/agent was identified. The ordinary #926 E2E stack without that runtime cannot establish this iframe+workspace baseline. The terminal execution prerequisite is a compatible, authorized hosted runner with the complete reviewed source. The connected mode is prepared, but image build, web development compilation, real authentication, iframe rendering and cleanup have not been exercised together. A first failure must be diagnosed at its actual stage, never labelled an Aster regression automatically.
