# Mobile agent capture corrections — 2026-11-01

All attached evidence is synthetic and local. The four supplied screenshots were inspected privately; their original bytes are not committed. No production project, model routing, provider credentials, or paid AI call was changed.

## Reproduction and corrections

- At 393 px, the old metadata box was 28 px high for 40 px of content (computed line height 19.88 px). The second line was clipped. It now grows with actual text, including enlarged text. Empty metadata no longer occupies space.
- During streaming, the summary reserves three actual line boxes instead of three assumed 1rem lines. The running status reserves one line; terminal cards release unused height. Long original reports remain available through a 44 px disclosure control.
- The exact historical system message about actions without a valid report is localized. Model prose and the original report remain unchanged. The provider-credit failure remains visible.
- The successful applied-files toast keeps its title and both actions visible; its redundant explanatory sentence moves into its details. Measured content height at 393 px: 144.33 → 122.45 px in Chromium and WebKit. Its vertical position is unchanged (y=113 px in the isolated measurement): the toast remains an overlay and can still cover content. This change reduces its height; it does not eliminate overlap. Incomplete-generation warnings stay visible and never gain a success statement.
- The mobile jump-to-latest button previously overlaid report text. It now occupies a 46 px strip outside the transcript scrollport only when needed. The 44 px button remains centered and bottom navigation remains intact.

## Validation

- Production frontend/server build succeeded.
- Full app lint: zero errors (52 existing warnings).
- Monorepo typecheck succeeded after repairing missing local workspace package links and using the repository's pnpm 9.14.4.
- 52 targeted DOM/unit tests passed.
- 8 browser geometry tests passed: Chromium and WebKit, 390/393/430 px portrait and 852 px landscape; streaming height, completed density, metadata clipping, text enlargement, and original-report disclosure.
- All 6 compiled application cases passed (390/393/430 px × Chromium/WebKit): running → partial, portrait/landscape, reduced viewport, menu open/close, reload and back. Both jump-button cases passed: 44 px target starts below the transcript scrollport, and its real click returns to latest.
- `compiled-matrix.cjs` exercises the compiled application with an intercepted synthetic model stream. `compiled-scroll.cjs` measures the jump button against the actual scrollport. Their read-only synthetic API fixture is `../ui-agent-evidence-2026-10-27/harness/fixture.cjs`.

## Limits

The reduced-height viewport is a keyboard surrogate, not a physical iOS keyboard. Native Safari browser chrome, real safe-area insets and pinch zoom still require an iPhone check. The fixture deliberately blocks writes, so reload/back checks prove UI recovery, not durable production conversation persistence. This branch is not deployed; integration and release belong to the coordination session.

## Independent review follow-up

The compiled matrix and scroll scripts now set exit code 1 if any case records an error; uncaught runner errors also fail the process. Original successful receipts remain in this directory. Output directories can be isolated with `MOBILE_MATRIX_EVIDENCE`, `MOBILE_SCROLL_EVIDENCE`, and `MOBILE_STREAM_EVIDENCE`; `UI_BASE_URL` selects the compiled local server.

The additional `compiled-multilane.cjs` scenario starts twelve specialists and completes them individually while the turn remains open. It measures bottom following and a visible reading anchor at 390/430 px on both engines, then verifies that every completed card releases its reserved height. The initial uncorrected run exited 1: the middle-of-transcript anchor moved by 39.25 px in Chromium and 119.25 px in WebKit, despite ample content remaining below the viewport. `multilane-before-receipt.json` retains those measurements.

`AgentLaneList` now captures the visible lane before React changes its layout and compensates only the remaining displacement after browser anchoring. It leaves near-bottom following to the existing transcript hook. No fixed empty space is retained in completed cards. Three unit tests cover reader compensation, native anchoring without double compensation, and bottom-following ownership.

The synthetic harness allows one second for initial read-only history/provider hydration before entering the prompt. Multi-lane reader positioning waits for native keyboard scrolling to settle before collecting the reference; there are no forced clicks or reduced geometry assertions.

Final follow-up verification: all three scripts exited 0 (6 matrix + 2 scroll + 8 multi-lane cases). Across all twelve successive completions and the end of the turn, middle-reader displacement stayed ≤0.875 px on both engines. Bottom gap stayed ≤2 px. Completed cards measured 125.86 px versus 165.61 px initially, so no streaming reservation remained. New receipts are `compiled-review-receipt.json`, `scroll-review-receipt.json`, and `multilane-after-receipt.json`; the original receipts were not overwritten. Build, web typecheck, changed-file lint and all 61 targeted unit/index tests passed.

## CI guard follow-up

The first PR CI run found three guard failures (11,658 tests passed): the scroll-button source guard searched for the old parameterless signature, and the new browser fixture did not follow the suite's nested hook/explicit setup-timeout convention. The guard now verifies that the function exists before checking its unchanged bottom-state assertion. The browser cases share a named suite with an explicit 180-second setup budget. No product assertion was relaxed. All 15 affected guard tests and all 8 Chromium/WebKit geometry cases passed locally after the correction.
