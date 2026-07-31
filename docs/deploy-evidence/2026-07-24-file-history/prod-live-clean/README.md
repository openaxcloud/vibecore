# File History (RPL-FH-001.*) — LIVE prod proof (2026-07-31)

Feature deployed to production (`app.e-code.ai`) across three sequenced deploys,
each `deploy-main` green + prod healthy:

- **#59** (`1a81cb1f`) — File History feature.
- **#61** (`42f04184`) — panel opacity/z-index hardening (bulletproof overlay over Monaco).
- **#63** (`5b6901ef`) — panel opens on the latest version (Replit parity).

## How the proof was produced (real IDE, real saves)

Playwright drove the **real Project Editor** on `app.e-code.ai`: register → create
project → import `src/greeting.ts` → open the IDE → **edit + ⌘S several times**
(each real save appends a version via `workbenchStore.saveFile → fileHistoryStore.capture`)
→ open **History** → exercise every control. History persists in the browser
IndexedDB, so captures at each viewport show the real multi-version history.

## Clean live captures — three formats, both themes

| Format | File | What it proves |
|---|---|---|
| **Web** 1440 · dark | `desktop-1440-dark-{a-button,b-panel}.png` | History button bottom-right of the real editor; panel **Version 5/5 · Latest**, slider/Play/1×/Compare Latest/Restore, opaque (no Monaco bleed), no onboarding tour. |
| **Tablet** 768 · light | `tablet-768-light-{a-button,b-panel,c-compare,d-playback}.png` | Full set incl. **Compare Latest inline diff (+0 −1, real removed line)** with Restore enabled on a non-latest version, and playback. |
| **Mobile** 390 · dark | `mobile-390-dark-{a-button,b-panel,c-compare,d-playback}.png` | Mobile IDE: editor + History button; panel **Version 5/5 · Latest**, all controls, Compare diff, playback — clean/opaque. |

Sub-points covered live: **.1** button + standalone panel (independent of Git) ·
**.2** slider + ←/→ navigation · **.3** Compare Latest inline diff (real add/remove)
· **.4** append-only restore (Restore enabled on older version, disabled on latest)
· **.5** playback (play/speed) · **.6** responsive across web/tablet/mobile + light/dark.

The full 8-config responsive matrix (390/768/1024/1440 × light/dark) with every
interactive target measured **≥ 44px** is additionally captured against the real
production component in `../shots/` (harness), and behavior is locked by 23 unit
tests (`fileHistory.spec.ts`, `file-history-diff.spec.ts`, `FileHistoryPanel.spec.tsx`).

## Note on prod capture

Throwaway proof projects' workspace runtimes reconnect intermittently (a
full-screen "Loading E-Code" splash), so the capture harness waits for a stable,
connected editor and retries; the screenshots here are the settled, connected state.
