# Menu readiness diagnostic — 2026-10-30

Base examined: bd5e0f5ea87767849d266b031b13fe4ae2e0967a, branch fix/ide-menu-hydration-20261030.
No repository sources edited. No shared build/server action.

Existing external patch /workspace/ui853-hydration-gap-diagnostic/proposed.patch still passes git apply --check.
Minimal production delta: BaseChat.tsx imports remix-utils/use-hydrated, replaces local false readiness state with useHydrated(), removes its passive setClientHydrated effect. No queued keyboard events or replay.

## Evidence
readiness.spec.tsx runs real MobileOverlayFocusProvider/useMobileOverlayFocus and installed useHydrated under StrictMode. Four tests pass (test.log):
- Current implementation: first replacement layout commit has neither trigger nor restored focus; subsequent commit restores both.
- Proposed implementation: first replacement layout commit contains trigger and restored focus.
- Different project scope does not revive old control focus.
- Server HTML omits mobile button; hydrateRoot completes without onRecoverableError and then shows button.
SSR in jsdom emits known useLayoutEffect server warnings from instrumentation and existing hooks; these are not claimed absent. No recoverable mismatch was observed in this reduced tree.

## Product regression proposal
Add a small readiness/remount regression alongside MobileOverlayFocus.spec.tsx using the real provider and useHydrated. Preserve scope-change guard. Include SSR hydration parity in isolated environment, recording recoverable errors. Existing tests remain necessary for query, selection, opener restoration, child dialogs and Tab confinement.

## Required browser proof before claiming actual Enter fixed
- Use real synthetic project and delayed existing shell handoff, focus actual Panels/Tools/Tabs opener before replacement.
- Observe first replacement root: trigger exists, is focused before native Enter; send Enter once through browser keyboard, verify exactly one opening and no delayed second activation.
- Repeat mobile390/tablet820 and desktop return, with CPU throttling and query draft retained; Escape restores the actual opener.
- Preserve mobile matrix assertion that pointer opening Tools does not focus search or open virtual keyboard.
- Initial SSR page and delayed Suspense hydration must have no hydration recovery warnings; desktop must not briefly show mobile chrome.

## Limits
No full BaseChat rendered by this diagnostic, no native Enter tested, no claim of 40ms timings in jsdom. Readiness fix eliminates this one passive-effect blank commit only. Media-query readiness, persisted overlay restoration (still passive), loading/Suspense replacement can each create separate gaps. Initial hydration intentionally still uses false server snapshot. Existing live input focus must not be stolen. Tests send no prompt, network request or runtime action.

## Browser baseline 2026-10-30 — real compiled BaseChat

Source supplied by parent: main `bd5e0f5ea`, build label `ui856-menu-baseline`, local app 21999 and isolated fixture 8799. Script `probe.cjs` uses Chromium, CPU throttling ×4, genuine synthetic archive with 60 source files plus README, GET ide-state held then released. No source/CSS/DOM injection, no keyboard replay, no production access. MutationObserver observes the original real opener detachment and calls the Node bridge, which immediately sends one native Enter (no intermediate browser snapshot). Bridge/CDP latency is part of this controlled reproduction; this is not a certification of the exact historic CI timing.

- `baseline-gap/receipt.json`: **3/3 product failures reproduced**, Tools390×844, Tabs820×900, Tabs1180×757. At detachment new shell exists, mobile header and both dock openers are absent, BODY focused. In all three receipts both native keydown and keyup target BODY while openers remain absent. They later reappear and focus returns, but dialog does not open within the unchanged 5-second visibility assertion. Screenshots retained as small JPEGs.
- `baseline-stable/receipt.json`: **3/3 pass**, same formats/CPU/fixtures; wait for naturally recreated opener, focus, single Enter opens; Escape closes and restores opener. This isolates activation failure to replacement timing rather than unsupported menu keyboard action.
- `baseline-navigation/receipt.json`: **3/3 pass**, one native Enter following detachment, then browser navigation to synthetic-second. Both dialogs absent in the new rendered shell. This is a full-document navigation witness only, NOT proof of a same-document SPA navigation during the exact gap, nor broad asynchronous action-isolation certification. No second activation is sent.

All browser contexts closed and owned transient profiles removed. Parent server untouched. No product source changes. These browser results are separate from the readiness unit harness above; the latter's stated limits remain specific to that harness.


## Browser corrected build — ui856-menu-fixed

`probe-fixed.cjs` preserves the baseline native Enter timing and 5-second visibility assertion. For gap cases it additionally requires the detach snapshot to show replacement=true and the expected opener already focused. No refocus, key replay or increased wait is used. The script stops after its first failed case. All requested bounded runs completed without retries:

- `fixed-gap-1/receipt.json`, `fixed-gap-2/receipt.json`, `fixed-gap-3/receipt.json`: **9/9 direct cases green** (three independent passages of Tools390, Tabs820, Tabs1180).
- `fixed-stable/receipt.json`: **3/3 stable activation/Escape/focus cases green**.
- `fixed-navigation/receipt.json`: **3/3 new-document project navigation cases green**, same explicit SPA limitation as baseline.
- `fixed-native-zoom200/receipt.json`: **3/3 direct gap cases green at browser-native 200% zoom**. Physical viewports390×844,820×900,1180×757 become CSS195×422,410×450,590×378; DPR2, CSS zoom1. This checks activation/focus under zoom, not a complete layout/accessibility certification.

After screenshots were taken only on the third scheduled direct passage, AFTER the existing visible-dialog assertion: `fixed-gap-3/tools390-gap-visible.jpg`, `tabs820-gap-visible.jpg`, `tabs1180-gap-visible.jpg`. Before images remain in `baseline-gap/*-failure.jpg`.

All contexts closed; zero owned profile directories remain. No product or E2E repository files edited by this browser task; parent-owned server preserved. Chromium and synthetic local contracts only, no physical Safari or production verification. Build composition and commit publication remain parent responsibilities.
