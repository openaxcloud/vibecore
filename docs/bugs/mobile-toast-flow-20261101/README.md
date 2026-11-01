# Applied-file notice in the Agent layout — 2026-11-01

This follow-up is separate from PR #881's green head `4692759e0946789104cb9df9770e51adeb30f256`. That head remains unchanged.

Applied-file notifications now use a dedicated Toastify container below the visible Agent transcript. The row occupies actual layout space, releases all height when closed, and keeps the grouped file list, Undo all, Dismiss all, and persistent incomplete-generation warning. Coalesced updates stay in the same container. When the Agent panel is not visible, a newly opened notification retains the global destination; this change does not redesign other global notifications.

The dock bounds expanded content to `min(180px, 18dvh)` with internal vertical scrolling. The initial 25dvh cap left only 1.5 px of transcript in a 390 px-high landscape viewport. The cap was corrected rather than relaxing the minimum readable viewport assertion. The bottom menu and composer remain outside the notice row.

## Verification

- Production frontend and SSR build passed.
- Changed application-file lint and `tsconfig.web.json` typecheck passed.
- All 1,501 chat tests passed (183 files), including the new notification-routing tests. The 11 grouped-undo tests and 16 bug-index tests also passed.
- `compiled-toast.cjs` exercises the compiled application with synthetic data. It locates the built module and exposes its existing notification function through test-only response instrumentation; no production hook is added and no notification implementation is replaced.
- The fixture returns an empty synthetic IDE memory for reads. All persistence writes, external requests, and WebSockets are blocked. No paid model, provider key, or real project is used.
- Reader positioning is a geometry precondition: the harness records the initial bottom scroll event and moves the actual scrollport to 500 px. It is not physical touch-gesture coverage. The notice, menu, disclosure, Undo, Dismiss and jump controls are exercised through ordinary Playwright clicks.

Run against a compiled local server backed by `../ui-agent-evidence-2026-10-27/harness/fixture.cjs`:

```sh
UI_BASE_URL=http://127.0.0.1:18204 MOBILE_TOAST_EVIDENCE=/workspace/mobile-toast-check node docs/bugs/mobile-toast-flow-20261101/compiled-toast.cjs
```

The runner exits nonzero if any case fails. Receipts and screenshots are synthetic local evidence. Chromium 154.0.8037.57 and WebKit 26.4 (build 2272), Playwright 1.59.1, Debian 13.

Final compiled run: all six cases passed and the process exited 0 (390/393/430 × Chromium/WebKit). Each also covered 852 px landscape and a 450 px-high keyboard surrogate. Reading-anchor displacement was 0 px in every case. The 44 px actions stayed within the notice row (subpixel rounding ≤0.5 px), above the jump button and composer. The shortest tested transcript remained about 29 px high in 390 px landscape; expanded notice content scrolls internally. Menu open/close, details, six-file coalescing, Undo callback, Dismiss, zero-height empty dock, bottom-following and persistent incomplete warning passed. `receipt.json` contains the measurements; the initial short-landscape failure is retained separately. Representative final screenshots were inspected in pixels on both engines.

## Limits

No physical iPhone, native keyboard, browser chrome, true safe-area inset or pinch-zoom validation. Reduced viewport height is a keyboard surrogate. This branch is not deployed. Its local validation is distinct from the green CI of #881; no follow-up PR or new GitHub CI verdict is claimed here.
