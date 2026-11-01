# Mobile agent capture corrections — 2026-11-01

All attached evidence is synthetic and local. The four supplied screenshots were inspected privately; their original bytes are not committed. No production project, model routing, provider credentials, or paid AI call was changed.

## Reproduction and corrections

- At 393 px, the old metadata box was 28 px high for 40 px of content (computed line height 19.88 px). The second line was clipped. It now grows with actual text, including enlarged text. Empty metadata no longer occupies space.
- During streaming, the summary reserves three actual line boxes instead of three assumed 1rem lines. The running status reserves one line; terminal cards release unused height. Long original reports remain available through a 44 px disclosure control.
- The exact historical system message about actions without a valid report is localized. Model prose and the original report remain unchanged. The provider-credit failure remains visible.
- The successful applied-files toast keeps its title and both actions visible; its redundant explanatory sentence moves into its details. Measured content height at 393 px: 144.33 → 122.45 px in Chromium and WebKit. Incomplete-generation warnings stay visible and never gain a success statement.
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
