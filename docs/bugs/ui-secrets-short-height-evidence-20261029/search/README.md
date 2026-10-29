# Search selection loss investigation (before Back)

Scope: CI844 responsive-ide.spec.ts selection assertion before Back: expected[1,4,backward], observed[5,5,forward]. Product source read-only; no test/assertion edits in repository. Base8443c61, parent-owned21999 compiled baseline, synthetic runtime/API fixture, no real data/mutations/AI. AGENTS read; available commit-helper skill not relevant (no commit requested).

## Source findings

SearchDraftState.tsx useSearchFocusHandoff captures the focused field and selection in layout cleanup, passes a scoped receipt to successor layout setup, focuses it and applies setSelectionRange. Receipt expires in a microtask. Search.tsx has no independent autofocus/selection writer; PanelInput is a plain controlled input. Existing tests cover immediate remount with backward selection. These observations do not establish the CI failure's cause.

## Bounded browser probes

-1 sample390px CPU×4 (`baseline/receipt.json`): passes. This first diagnostic included an extra pre-release read and may perturb timing.
-3 predetermined390px CPU×1 samples (`identity/receipt.json`): passes, extra pre-release read removed. Each records selected node identity inside the same selection-setting operation. Later original handle equals that exact node, then detaches; successor has[1,4,backward]. Native setSelectionRange interception records initial assignment and successful handoff on value alpha. React assigns alpha to the new detached input before insertion, then handoff restores selection. No unexpected later setter is recorded in these passes.

Instrumentation reads native selection/value/focus events and stack traces, preserves native behavior, no production code injection/patch. All4 samples pass, no browser JavaScript errors. No Back/navigation regression tested here. Browsers closed, root server untouched. No unbounded retries.

## Conclusion and next evidence

Neither a product defect nor a fixture identity race was reproduced. The CI failure remains OPEN; a passing retry does not resolve it. No product correction is justified yet. To establish causality, capture the failing CI sequence's selected-node identity, receipt selection at cleanup and target selection/value immediately after setup, plus later input value/focus writers. If a locator/handle race is actually demonstrated, capture selected node+element handle atomically in the test; this is only a proposal, not an applied workaround. Do not weaken selection assertions or alter handoff timing without red evidence.

Existing Search.draft.spec.tsx executed unchanged; see existing-unit.log for exact count and verdict. No build/commit/push.
