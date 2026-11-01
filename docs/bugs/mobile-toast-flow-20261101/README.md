# Applied-file notice in the Agent layout — 2026-11-01

This follow-up is separate from PR #881's green head `4692759e0946789104cb9df9770e51adeb30f256`. That head remains unchanged.

Applied-file notifications now use a dedicated Toastify container below the visible Agent transcript. The row occupies actual layout space, releases all height when closed, and keeps the grouped file list, Undo all, Dismiss all, and persistent incomplete-generation warning. Coalesced updates stay in one persistent container owned by the app root. Its portal host moves into the visible Agent dock and back to the global position when Agent is hidden. The toast DOM is retained, preserving disclosure state, callbacks and focus. Other global notification types are unchanged.

The dock bounds expanded content to `min(180px, 18dvh)` with internal vertical scrolling. The initial 25dvh cap left only 1.5 px of transcript in a 390 px-high landscape viewport. The cap was corrected rather than relaxing the minimum readable viewport assertion. The bottom menu and composer remain outside the notice row.

## Verification

- Production frontend and SSR build passed.
- Changed application-file lint and `tsconfig.web.json` typecheck passed.
- All 1,502 chat tests passed (184 files) before the final animation-clock adjustment, including the new notification-routing tests; the host/routing unit tests were rerun after that adjustment. The 11 grouped-undo tests and 16 bug-index tests also passed. The navigation follow-up additionally passed 38 root/route-graph tests and the built root critical-path guard.
- `compiled-toast.cjs` exercises the compiled application with synthetic data. It locates the built module and exposes its existing notification function through test-only response instrumentation; no production hook is added and no notification implementation is replaced.
- The fixture returns an empty synthetic IDE memory for reads. All persistence writes, external requests, and WebSockets are blocked. No paid model, provider key, or real project is used.
- Reader positioning is a geometry precondition: the harness records the initial bottom scroll event and moves the actual scrollport to 500 px. It is not physical touch-gesture coverage. The notice, menu, disclosure, Undo, Dismiss and jump controls are exercised through ordinary Playwright clicks.

Run against a compiled local server backed by `../ui-agent-evidence-2026-10-27/harness/fixture.cjs`:

```sh
UI_BASE_URL=http://127.0.0.1:18204 MOBILE_TOAST_EVIDENCE=/workspace/mobile-toast-check node docs/bugs/mobile-toast-flow-20261101/compiled-toast.cjs
```

The runner exits nonzero if any case fails. Receipts and screenshots are synthetic local evidence. Chromium 154.0.8037.57 and WebKit 26.4 (build 2272), Playwright 1.59.1, Debian 13.

Final compiled run: all six cases passed and the process exited 0 (390/393/430 × Chromium/WebKit). Each also covered 852 px landscape and a 450 px-high keyboard surrogate. Reading-anchor displacement was 0 px specifically when the toast appeared in portrait at scrollTop=500. This measurement does not cover orientation changes or navigation. The 44 px actions stayed within the notice row (subpixel rounding ≤0.5 px), above the jump button and composer. The shortest tested transcript remained about 29 px high in 390 px landscape; expanded notice content scrolls internally. Menu open/close, details, six-file coalescing, Undo callback, Dismiss, zero-height empty dock, bottom-following and persistent incomplete warning passed. `receipt.json` contains the measurements; the initial short-landscape failure is retained separately. Representative final screenshots were inspected in pixels on both engines.

## Active-toast navigation review

The initial head `577c6c692b1d3fc292f4b692df88a69f96d75aee` failed both transitions on Chromium and WebKit at 390 px: global → Agent retained a global toast, and Agent → global retained a hidden docked toast. `navigation-before-receipt.json` records all four failures.

The app root now owns one stable portal target. Visibility changes move that target without recreating the notification. Dock ID `agent-applied-files-dock` differs from Toastify container ID `agent-applied-files-notices`; the toast ID is `agent-auto-applied-files`. The tests check all three counts, the localized region label, and the polite status announcement. Native summary/details provide their own association.

Reparenting reset the CSS progress animation used by Toastify's auto-close timer. The measured clock fell from about 2,470 ms to 0–33 ms (`timer-reset-before-receipt.json`). The host now retains CSS animation times, including the last visible frame before a parent becomes hidden. Idle and paused notifications do not require a frame loop.

`compiled-toast-navigation.cjs` covers both directions at 390/393/430 px on both engines: an active six-file persistent warning, expanded details, the exact same DOM element after movement, one notification throughout, Tab/Enter/Space focus and activation, callback invocation, dismissal, subsequent navigation without resurrection, and reopening a fresh two-file notice. `TEST_TIMER=1` also switches panels three seconds into a temporary toast and verifies closure within the original timing budget including entry/exit transitions.

Outside Agent, the notice retains the global overlay placement; the non-overlap claim applies to the Agent transcript only. The host unit test additionally preserves a focused input and its value across both DOM moves. Browser keyboard coverage enters the disclosure with focus(), then uses Tab/Enter/Space for disclosure and actions.

Final run after the animation-clock fix: **12/12 navigation cases passed**, including timers, with exit 0. Total appearance-to-removal time was 6011–6187 ms (including entry/exit transitions); no progress clock reset was observed. All three IDs occurred exactly once and maximum simultaneous applied-file notices was one in every case. `navigation-after-receipt.json` records this run. The separately rerun geometry matrix passed **6/6** with exit 0 (`geometry-after-navigation-receipt.json`). Four 393 px navigation screenshots were inspected in pixels on both engines.

The Undo assertion invokes a synthetic counter callback. It does **not** prove file restoration. Navigation cases do **not** measure reading-anchor displacement; the 0 px claim remains limited to portrait appearance at scrollTop=500 in the separate geometry harness.

## Limits

No physical iPhone, native keyboard, browser chrome, true safe-area inset or pinch-zoom validation. Reduced viewport height is a keyboard surrogate. This branch is not deployed. Its local validation is distinct from the green CI of #881; no follow-up PR or new GitHub CI verdict is claimed here.
