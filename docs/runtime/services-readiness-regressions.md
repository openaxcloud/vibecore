# Services UI and file-read readiness regressions

## Current Services UI coverage

The Services runtime scenario keeps all 18 runtime scenarios and its original time limits. Its Git checks now target the canonical GitTab component: Working tree exposes changed files, Staged exposes staged files, and Commit graph exposes commit history. The Commit & push control is checked for visibility; the scenario does not submit a Git operation. The tab menu uses the current Options for Git name and the Close to right menuitem, preserving the same close-right handler.

The pinned Shell retains its current 420 px default and 320–720 px restoration and resize bounds. A visible, accessible height output is restored and follows both committed state and the existing direct-DOM resize path. This does not change the resize bounds, persisted state, or terminal execution behavior.

The scenario checks actual browser geometry, a 38 px tab bar, the height output against the measured height, status and session metadata, and the loaded Shell bar. It also checks Output, Problems, the real Debugger surface, refresh returning to Shell, and hide/show controls. Monitoring remains independently checked later in the scenario. Earlier Publish and Snapshots tab checks remain in place.

Visual expectations use independent neutral probes to resolve semantic app/panel/background/border/accent tokens. They do not copy a terminal element's computed property back into its expectation. The final IDE-scoped Sass rule overrides the earlier tab-bar gradient with the solid panel token; the scenario explicitly checks that final background and absence of a gradient, plus the active inset accent.

Controlled component tests execute production JSX and callbacks. Separate sensitivity cases execute the actual E2E assertion block and reject wrong geometry, colors, transparency, gradient, borders, accent, missing metadata, and unresolved tokens. These tests are not a replacement for browser rendering. Local Chromium could not start because the execution environment rejected socket creation before any page opened. Sass compilation and component tests passed. Subsequent GitHub run 42835307783 executed and passed the terminal geometry, semantic colors, views, metadata and hide/show assertions before reaching the next command-palette check. No security or network restriction was changed to obtain a local result.

## Restore saved tabs before applying the initial URL

The Services scenario really reloads the page after the Secrets panel persistence check. The desktop tab strip renders every tab; missing Publish and Snapshots entries are not an overflow or virtualization artifact. A controlled regression reproduces the ordering defect: adding the URL panel to the default tree before memory arrives makes the existing restore predicate reject the saved tree as if the user had changed it.

The desktop URL effect now waits for actual memory restoration completion, rather than the earlier readiness fallback. Completion is associated with the project, and cancelled responses cannot release the barrier. The existing guard continues to preserve a newer user split or a closed editor. Empty and failed memory loads release navigation, and later URL changes and the Domains alias remain covered. The readiness fallback, its deadline, mobile behavior and saved-layout conflict policy are unchanged. Publish and Snapshots checks are retained; the test does not reopen them artificially.

This is a reproduced product defect. The CI artifact does not contain the saved response body, so it does not prove this was the sole cause of the missing tabs in that run. Run 42835307783 confirms that Publish survives the reload and shows both saved Publish and Snapshots tabs in the failure context. The complete Services scenario remains unvalidated: it stops later at an ambiguous command-palette selector.

The actual persistence callback is tested with the real memory module: a readiness fallback alone and mismatched project/workspace scopes do not save. After restoration, saving and clearing the cache preserves the restored tabs on reread. Network responses are controlled in this regression, not a live server claim.

A separate pre-existing issue remains: the restoration guard is keyed by project rather than workspace, so changing to another workspace within the same project can skip its saved layout. A broader workspace-scoped attempt was rejected during local review because hydration and navigation replay could lose the user's selected tab or replace another scope's saved layout. It is not included in this patch. A safe fix needs separate coverage of initial workspace hydration, concurrent navigation, genuine edits, and persistence isolation. The initial-URL fix does not claim to repair that path.

## File reads during a known start

`listFiles` and `readFile` now wait only when their own runtime adapter already has a workspace start in progress. They do not introduce a new start, timeout, retry, or API response policy. A refused or cancelled start is propagated instead of sending a file request to a not-yet-ready workspace.

A start generation and project/workspace identity check reject a read if its context changes while waiting. The barrier is limited to file reads; startup status polling remains independent, avoiding a cycle in which startup waits on itself. Without an active start, file reads keep their existing behavior.

Pure order-of-operations tests reproduce both premature reads before the change. Regressions cover listing and reading, rejected and cancelled starts, project/workspace changes, superseded starts, polling without a cycle, and immediate reads when no start is pending. Existing retry and genuine 404 behavior remain covered by the runtime-remote suite.

This fixes a demonstrated coordination defect, but does not prove that every HTTP 502 in run 42823209623 arose from it. Those 19 errors coincided with environment-driven pod recreations; the artifacts do not establish whether each affected adapter knew about the active start. Replacements initiated elsewhere are a separate case. The five file 404 responses and two IDE-state 412 conflicts remain visible; ETag protections and audit verdicts are unchanged.

## Validation commands

- `pnpm exec vitest run app/components/git/GitTab.async.spec.tsx tests/guards/runtime-services-tab-options.spec.tsx tests/guards/runtime-services-terminal.spec.tsx`
- `pnpm exec vitest run app/components/chat/project-layout-url-restore.spec.tsx app/components/chat/BaseChat.preview-startup.spec.tsx`
- `pnpm --filter @vibecore/runtime-remote test`
- `pnpm run typecheck`
- `pnpm exec playwright test tests/e2e --project=chromium --grep @runtime --list`

The ephemeral runtime workflow selects the new component regressions and the full runtime-remote suite. Runtime acceptance and the IDE audit still determine the live verdict; neither local checks nor a diagnostic experiment changes a failed acceptance result.

## Follow-up after run 42835307783

[Runtime run](https://github.com/openaxcloud/vibecore/actions/runs/42835307783): preflight 2/2, runtime 16/18. The Services failure has moved past the Git, restored-tab and terminal checks to the command palette. The previous broad label locator matches three actual elements: the close backdrop, the dialog, and the add-tab button. The exact dialog role/name keeps the same visibility assertion, keyboard action and timeout. A production-JSX regression reproduces the old ambiguity, verifies the exact target, dismissal and tool activation. All 18 scenarios and existing budgets remain intact.

The full unit suite also found two regressions introduced by the terminal height readout: raw interpolated `px` text violated the i18n scanner. Rendering and live resize now use the same dedicated translated interpolation, with EN and FR regressions. The scanner, exemptions, geometry and resize limits are unchanged. The complete root unit command cannot be rerun safely in this local environment because it launches Chromium and real loopback servers; focused checks, types and build are run locally, with the full suite required in CI.

The IDE audit reports 77/81 functional checks, plus 21 HTTP errors separately. Packages now records an explicit timeout; Storage and Extensions retain their distinct historical capability gaps. The audit verdict and HTTP collection are unchanged. The generic agent command path has a documented 30-second cap, despite the Packages request asking for five minutes. The failed request took about 33 seconds; the preceding successful run took about 30 seconds. This establishes the timeout boundary, not why the install took that long. This follow-up does not raise the generic cap, use a background command to evade it, or claim the Packages problem fixed.
