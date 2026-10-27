# Compact initial Agent panel — isolated browser proof

Parent reported an authenticated production observation at 1180×757: Agent selected while the body showed Webview startup; clicking Agent restored it. This agent did not access that production session or its saved memory.

## Confirmed mechanism

1180px belongs to the compact/tablet layout (`TABLET_MAX_WIDTH=1199`). BaseChat initially selected Agent/chat, then asynchronous `ui.mobilePanel` restoration directly called `setMobilePanel`, bypassing the tab/header state. With a synthetic delayed legacy `preview` receipt, widths320/768/1180 switched their body to preview and hid Agent while the Agent tab remained pressed. At1440 the desktop path did not do this.

The local before screenshot shows the workbench/editor/preview frame, not the exact production Webview startup text. It proves the state/header/body divergence, not identical production pixels or the contents of the user's saved memory.

## Correction

Removed only that legacy compact surface restoration. The existing contract in responsive-ide.spec.ts says bare project entry opens Agent and panel URLs own compact restoration. URL navigation, desktop layout restoration and project cancellation guards remain unchanged.

## Browser results

- Before: three compact mismatches at320/768/1180; desktop1440 negative control. `before.json` and four screenshots.
- After:10/10 cases passed on the newly compiled combined branch: three compact widths × bare entry / explicit preview with legacy files memory / Files selected while memory pending, plus desktop1440.
- After restoration, assertions wait for `layout-restored` and two animation frames, not merely HTTP200.
- At320/768/1180: native clicks, Preview/reload/Back Agent/Forward Preview passed.
- At1180: unsent textarea contents survived resizing1180→1440→768→320→1180.
- Final harness: zero page errors,42 blocked external or mutation attempts. API is synthetic localhost; no real customer data, OAuth/provider calls, payment or deployment tested.
- An initial after receipt had13 localStorage errors from the instrumentation also running in opaque iframes. Those diagnostics are retained as `after-matrix-initial-harness-errors.*`. The instrumentation was restricted to the top window, then the same10 cases were rerun successfully. Product code was not changed for this rerun.

Five committed E2E regression cases were added in responsive-ide.spec.ts and successfully collected with `--list`; this agent did not execute them against a real local backend. The10 browser cases above use the real compiled UI with synthetic API receipts. Lint, format and diff-check passed for the two owned source/test files. Parent owns combined typecheck/build/CI and publication.

## Limits and process ownership

Chromium only, no physical Safari/iOS; cross-project SPA navigation was not exercised. This is targeted navigation coverage, not a global responsive certification. Source hashes are recorded in source.json. Browser contexts were closed. Before fixture8299 PID25773 and before web18299 PID25787 were intentionally kept alive for the parent's parallel recipe; their command lines/start ticks are in process-origin.json. Root owns the after server18399 and controls final cleanup coordination.
