# File History (RPL-FH-001.*) — build + proof evidence (2026-07-24)

Replit-parity **File History**: a per-file, append-only version history in the
Project Editor, independent of Git.

## What ships

| Layer | File |
|---|---|
| Persistence (dedicated IndexedDB `ecodeFileHistory`, keyed by project+path, cap 300/file) | `app/lib/persistence/fileHistoryDb.ts` |
| Store (append-only capture / dedup / restore, loading/error state) | `app/lib/stores/fileHistory.ts` |
| Capture wiring (human save, agent write, restore) | `app/lib/stores/workbench.ts` (`saveFile`, `writeFileContent`, `restoreFileVersion`, `configureProject`) |
| Panel UI (slider/arrows/keyboard, Compare Latest diff, Restore, playback, states) | `app/components/workbench/FileHistoryPanel.tsx` |
| Inline diff util | `app/components/workbench/file-history-diff.ts` |
| Bottom-right History toggle + panel host | `app/components/workbench/EditorHistoryOverlay.tsx` |
| Mount points | `EditorPanel.tsx` (mobile/tablet Workbench pane) + `BaseChat.tsx` desktop Project Editor pane |
| Slider styling | `app/styles/components/file-history.scss` |

## Sub-points

- **RPL-FH-001.1** History button (bottom-right of the open text file) + standalone panel, independent of Git.
- **RPL-FH-001.2** Version navigation via slider, prev/next arrows, and ←/→ keyboard — all drive the same index.
- **RPL-FH-001.3** Compare Latest = real inline diff (additions/deletions, +N/−M stat).
- **RPL-FH-001.4** Restore is append-only (new version appended; older versions kept; `restoredFromSeq` recorded).
- **RPL-FH-001.5** Playback: play/pause, progression via the slider, speed 0.5×/1×/2×/4×.
- **RPL-FH-001.6** Responsive + accessible + loading/error/retry states.

## Automated proof (green)

- Store: `app/lib/stores/fileHistory.spec.ts` — 9 tests (append-only, dedup, seq, restore append-only + `restoredFromSeq`, baseline seed, external-drift capture, error status, project switch clears cache).
- Diff: `app/components/workbench/file-history-diff.spec.ts` — 5 tests (real add/remove/modify counts, order preserved).
- Component (jsdom + testing-library): `app/components/workbench/FileHistoryPanel.spec.tsx` — 9 tests (controls render, prev-arrow + ←/→ keyboard nav, slider nav, real Compare diff, append-only restore calls workbench, restore disabled on latest, playback pressed-state, Esc closes, error+retry state).
- `pnpm --project tsconfig.web.json` typecheck: **0 errors**. ESLint on all changed files: clean.

## Visual proof (real component + E-Code styles, all 8 responsive configs)

Captured with Playwright/Chromium against the real `FileHistoryPanel` +
`EditorHistoryOverlay` rendered with production styles and theme tokens. Every
interactive control measured **≥ 44px** high across all configs (the IDE design
system uses a 12–14px root font, so the controls use literal-px min sizes to
guarantee the touch target regardless of rem scaling).

`shots/` (light + dark):

- `*-b-panel.png` — panel at **390 / 768 / 1024 / 1440**, light and dark (RPL-FH-001.1/.2/.5/.6).
- `tablet-1024-dark-c-compare.png` — Compare Latest inline diff **+3 −2** (RPL-FH-001.3).
- `desktop-1440-dark-d-playback.png` — playback active (RPL-FH-001.5).
- `error-*.png` — error + Retry state (RPL-FH-001.6).

## Status

- 📤 Dispatched · 💻 Coded (this change) · ✅ **Testé live pending the production Project Editor** (local dev cannot provision a workspace — no `workspace-manager` — so the full-IDE button-in-editor + save→version check is done on prod after deploy). The component, its responsiveness, a11y targets, and capture-on-save logic are proven above.
