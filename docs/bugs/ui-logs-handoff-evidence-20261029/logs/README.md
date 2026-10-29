# Logs selection handoff — 2026-10-29

Baseline compiled e03b3f856, synthetic browser API only. No client project, actual runtime or provider calls; external requests and unhandled mutations blocked.

## Reproduced before correction
- `gated-handoff/receipt.json`: at1440×900, select System while GET ide-state held. System=true,3lines. Release response; old actual Logs DOM detaches, successor System=false,0lines; strict5second assertion fails.0JSerrors.
- `clear-delay-error-recovery/receipt.json`: same handoff reset; after explicit reselect on stable shell, Clear gives0lines, delayed Reload visiblydisabled then3lines/Systemtrue. Network abort displays accessible error; Retry recovers but Systemfalse until explicit reselect.0JSerrors.
- Screenshots before/after are synthetic; after-release image inspected visually (Console empty state replaces selected System).
- This proves a real local-state-loss mechanism. No CI trace proves that exact ordering caused the historic CI retry.

## Local correction
`BaseChat.tsx`: ProjectLogsPanel receives projectId/paneId and reads seven view controls through route state.
`IdeSettingsDraftState.tsx`: map keyed project/pane in existing route/window-keyed provider; controls only, no logs/data/credentials persisted. Other callers retain local fallback.
`ProjectLogsPanel.handoff.spec.tsx`: actual component extracted from source,6tests; proves handoff, controls/clear/reload/pausedpoll, pane/fallback isolation (including no pane under provider), actual IdePaletteProvider project/window/reset. Helper filtering stub means this suite verifies controls, not filter algorithms.
`ide-logs-clear-reload.spec.ts`: existing real-backend E2E now gates/continues actual ide-state GET, confirms startup DOM detached and System retained. Post-errorRetry must retainSystem without reselect. Original fullreload reselect retained, assertions/timeouts not weakened.

## Validation
- Initial actual-component test red (true expected/false received): `unit-red.log`.
- Final6Logs+13existingSettings tests =19/19pass: `unit-final.log`.
- ESLint4changedfiles exit0: `lint-final.log`.
- Direct tsc tsconfig.json exit134 heapOOM; no type verdict from this invocation. Parent running official typecheck separately.
- Independent review favorable; parent's compiled build and final synthetic browser recipe pending at time of writing.
- No commit/push/build/serverrestart by this agent. Browsers closed.

## Final compiled correction — ui847-logs-fixed
2026-10-29: two sequential recipes,1440×900 and1024×900, Chromium, synthetic API.
`final-1440/receipt.json` and `final-1024/receipt.json` both pass on first execution,0JSerrors:
- System=true/3lines before release; old Logs DOM detached; System remains true/3lines.
- Clear produces0lines; delayed Reload becomesdisabled then restores3lines/Systemtrue.
- Injected request failure shows alert; Retry removesalert and restores3lines/Systemtrue WITHOUT reselect. Field name recoveryBeforeReselect retained for comparability; final script contains no reselect.
- Recovered screenshots inspected visually at both widths: selected System,3synthetic lines, reachable controls;1024 bottom navigation retained.
All browsers closed in finally. Parent server unchanged; no sources changed during final recipe. Parent reported official full typecheck/build successful,42targeted tests and16inventorychecks; those are parent validations, not reexecuted here. Full real-backend E2E and production are not claimed by these browser fixtures.
