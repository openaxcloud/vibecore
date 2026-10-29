# Mobile tab switcher390 — bounded read-only diagnostic

CI843 ef764, job123218470008: reported failure at first visibility assertion after Enter, before Escape/focus restoration; retry1 passed. Cause remains unknown. No historical restricted artifact downloaded or alternative access attempted.

Local root-owned server21999/8799, buildd60, Chromium390×844 with touch. Archive matches panel-visibility fixture: README240lines +60sourcefiles. Real compiled UI, synthetic isolated auth/API/runtime transport; external traffic and mutations blocked. This does not reproduce the CI real isolated registration/import backend. No production client operation. No source/test/assertion/timeout changes, no server/build/workflow control.

Exact selectors and two-cycle action sequence from ide-panel-visibility.spec.ts tabs case: focus trigger, Enter, menuvisible within default5000ms, focus search, typeEditor, Escape, menuabsent and triggerfocused; then button open/close. Observer only captures bounded structural IDs/counts/route/loading/keyboard events, no message contents. Scripts use no traces/videos and capture only failure screenshots (none needed).

Results:
- baseline:3/3 complete recipes,6Enter/Escape cycles plus3button closures,0JSerrors.
- cpu4-open:3/3 complete recipes,6Enter/Escape cycles plus3button closures,0JSerrors. CPUx4 enabled immediately before trigger focus/Enter and reset after menuvisible each cycle.
- In all three baseline first openings the visible trigger identity changed between beforeEnter and menuvisible; the recipe therefore exercised real remounts. Menus still opened and returned focus correctly. A remount alone is not established as the cause of the CI failure.

No reproduction of the missing-menu failure; no product correction justified. Existing case remains open, independent of README840 and interproject834. Browser processes closed in finally. No Safari/physical-device/full production claim.

Instrumentation limit: CPU attempt2 first `after menuvisible` snapshot contains zero trigger/menu nodes despite the just-passed visibility assertion. The next unchanged focused-input assertion and full cycle succeed. This is a transient shell-remount snapshot, not a continuous5000ms menu absence or a failure reproduced by this run. IDs are sample-local structural identity, not proof of uninterrupted visibility. An initial diagnostic-summary Python index assumed a nonempty trigger list and failed; raw browser receipts are intact and all actual assertions passed.
