# Solutions real-proof blockers

Date: 2026-08-03

Status: blocked before publication

Working branch: `codex/solutions-real-proof-20260802`

## Scope

The approved App Builder page remains live and unchanged. The eight remaining
Solutions pages have dedicated English and French sales copy, metadata, layouts,
and six proof slots per locale. Publication remains blocked because E-Code has not
produced the 96 required, accepted Agent-to-Webview captures.

No generated image, composite, retouch, reused App Builder capture, or simulated
IDE state has been accepted as proof. The public asset count for the eight pages is
therefore deliberately `0/96`.

## Reproduced platform blockers

### 1. Persistent IDE state and runtime filesystem diverge

A fresh Game Builder project stored a complete React/Vite `package.json` in the
persistent IDE state. The running workspace exposed a different, stale manifest.
The Agent-generated source therefore did not match the source used by the runtime.

Required platform contract:

- expose a revision and content hash for both persistent IDE state and runtime files;
- acknowledge a file revision only after it is available in the runtime;
- prevent install/start while the two revisions differ;
- invalidate or resync the runtime whenever the persisted project revision changes.

### 2. Dependency installation reports success without an executable runtime

The real IDE terminal repeatedly returned `up to date` for dependency installation,
then failed to start because the Vite executable was absent. The stale runtime
manifest and lock state made the install result misleading.

Required platform contract:

- install from the authoritative project revision;
- verify the expected executable after installation;
- fail the install state if the executable or declared dependency tree is absent;
- never mark the preview start as successful without a live process.

### 3. Agent completion is not tied to persisted acceptance criteria

On Website Builder, the Agent displayed all tasks as complete, but the requested
studio identity and journal section were absent from persisted source. On Dashboard
Builder, the Agent reported empty runtime files while the persistent IDE API returned
non-empty files.

Required platform contract:

- completion must require an acknowledged persisted file revision;
- prompt-specific checks must run against the persisted source;
- runtime and persistent revisions must be equal before completion;
- a completion claim must be revoked when any required check fails.

### 4. Model transport wrappers contaminate generated files

One fresh Website Builder generation appended an `antml` closing wrapper to ten
source and configuration files. Repair prompts reproduced the contamination.

Required platform contract:

- parse model transport markup before file persistence;
- reject wrapper markers, artifact tags, and Markdown fences at the write boundary;
- report the rejected file and request a clean regeneration instead of persisting it.

### 5. Preview health does not prove a rendered application

Observed combinations included:

- workspace reported as running while process and port lists were empty;
- port 5173 open but not ready;
- preview proxy alternating between success and 5xx responses;
- Problems counter at zero while the Webview remained blank;
- JavaScript rendered without its stylesheet;
- a dedicated preview host working briefly while direct proxy assets failed.

Required platform contract:

- readiness must verify substantive rendered DOM, loaded styles, and expected route;
- readiness must fail on console errors, failed application assets, or blank DOM;
- proxy, port, process, and manager status must agree before the UI shows ready;
- preview asset URLs and CSP behavior must work through the supported preview origin.

### 6. Diagnostics disappear when a workspace stops

After affected workspaces stopped, port and process requests timed out, log snapshots
returned an error, and the client-only Problems state was no longer recoverable.
Database and workspace-manager lifecycle states also disagreed during runs.

Required platform contract:

- persist the last port list, process list, Problems state, console errors, and logs;
- retain a post-mortem snapshot after workspace shutdown;
- expose one authoritative lifecycle state with transition timestamps and reasons.

### 7. Capture recovery is blocked by quota and missing model controls

Repair attempts exhausted the fresh capture account quota. The production project
creation surface did not expose a provider/model selector even though the models API
listed multiple providers, so the capture flow could not route around a failing model.

Required platform contract:

- provide a sanctioned capture/test account budget for the 16 locale scenarios;
- expose or document deterministic provider/model routing for proof generation;
- preserve failed attempts without charging repeated platform-caused retries, if that
  is the intended quota policy.

## Evidence retained locally

- Website Builder: `outputs/solutions/website-builder/ide-proof/en/02-preview-failed.png`
- Game Builder: `outputs/solutions/game-builder/ide-proof/en/02-preview-failed.png`
- Dashboard Builder: `outputs/solutions/dashboard-builder/ide-proof/en/02-preview-failed.png`
- Chatbot Builder: `outputs/solutions/chatbot-builder/ide-proof/en/02-preview-failed.png`

Capture session files are Git-ignored and restricted to the local user. They must
never be committed or copied into an issue.

## Marketing implementation status

- Eight dedicated, long-form English/French copy modules: complete.
- Honest local-demo limitations: complete.
- Internal AI legacy alias with query preservation: complete.
- Six unique proof slots per page and locale: complete.
- Lazy loading, dimensions, semantic figures, unique captions and alt text: complete.
- Strict rejection of missing, malformed, duplicated, or contaminated proof assets:
  complete.
- Real accepted public assets: `0/96`.
- Light/dark responsive matrix at 390/768/1024/1440: not run because assets are absent.
- Rebase, push, and deployment: intentionally not performed.

## Validation results

- Full lint: passed with no errors; existing warnings remain.
- Full typecheck: passed after installing the locked dependencies in the isolated
  worktree.
- Full unit/integration suite: 546 files passed; 4,188 tests passed; 1 skipped.
- Focused Solutions suite: passed; the strict 96-asset gate remains opt-in until the
  real assets exist.
- Playwright matrix: 384 scenarios compile; the live matrix has not been executed.
- Production client bundle: built successfully.
- Production SSR bundle: not completed during this run because concurrent host load
  left transformation running for more than 30 minutes; it must be rerun before push.

## Resume acceptance checklist

After the platform fixes are deployed:

1. Generate fresh projects for eight pages in English and French.
2. Verify prompt identity, persisted source revision, runtime revision, Webview DOM,
   CSS, interactions, console, Problems, process, port, and proxy health.
3. Capture the six required real IDE states for every scenario (`96/96`).
4. Run the strict asset validation and duplicate-hash checks.
5. Run the 128 page/locale/theme/width combinations at 390, 768, 1024, and 1440.
6. Rebase on current `origin/main`, then rerun lint, typecheck, tests, and full build.
7. Push and deploy only after every gate and live check is green.
