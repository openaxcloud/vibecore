# WebKit desktop recovery disclosure — unresolved initial failure

## Exact initial scenario

Product commit `0b1ed92c7fc1787097d531012cd11500728e9dd5`, WebKit 26.4, viewport 1440 × 852, French UI, legacy manual-review preference set to true. A fresh page opens the compiled Agent view with a read-only synthetic API. Four failed proposals are injected: one retryable, one conflicted, one truncated, one restored. The harness focuses the outer summary and presses Enter. The preceding assertion observes the outer details `open` attribute. The subsequent role query expects four buttons named exactly “Réessayer cette modification” but receives zero throughout its five-second assertion window.

`browser-expanded-details.json` retains the failure. **The initial run did not capture a DOM snapshot, mutation history or trace at failure.** The prior `open` assertion is a single observation, not proof that the same element stayed open during the later timeout. We therefore cannot determine whether the original failure was hidden content, a remount, a language change, or a selector/accessibility issue. There is no evidence of failed file application: this case did not invoke Retry.

## Diagnostic instrumentation and unchanged invariants

The compiled product and its event handlers were not replaced. The harness exposes the existing workbench and supplies synthetic proposals. Added diagnostics record native toggle events, DOM identities, `open`, inner `hidden`, button text, document language and connection/visibility. Full Playwright traces preserve snapshots and screenshots. Every case retains the original assertions: four retry buttons after opening; the safe button enabled; three unsafe buttons disabled; no Accept/Reject controls; no hunk checkboxes. Additional keyboard checks open the last file's diff disclosure, return to the outer summary and check viewport access. No forced clicks, assertion removal or timeout increases.

## New bounded experiments

- 12 WebKit pages: 390, 393, 430 px, then nine desktop 1440 px pages; all passed. Recorded intermediate `open=true, hidden=true` intervals lasted 7–30 ms before React removed `hidden`.
- Three desktop pages while the safe proposal's timestamp changes every 50 ms for four seconds; all passed. These are synthetic store updates modelling concurrent proposal refresh, not model calls. Intermediate intervals: 17–49 ms.
- One desktop page with the same update stress plus 40 keyboard close/open cycles; all 40 closed-state and reopened-state assertions passed. Including initial opening, 41 transitions measured 5–56 ms. Closed panels expose zero retry buttons; reopened panels expose all four.

Across these 16 additional pages, the traced queue retained its identity and French labels; no persistent `open`/`hidden` mismatch was observed. This does **not** establish what happened in the untraced initial failure. The earlier isolated pass and six repeats remain separately recorded; these results do not replace the failed series.

Receipts: `webkit-investigation.json`, `webkit-updates.json`, `webkit-toggle-cycles.json`. Raw traces remain under `/workspace/auto-review-webkit-{investigation,updates,toggle-cycles}/`. Workbench bundle: `workbench-DM0k-GH0.js`, SHA-256 `ec65ec40b6e2d330c8d89b3b15caf14ae44e6b57ea173f0c0dc76b53906108b5`.

## Verdict and remaining hypotheses

The cause is **not demonstrated**. No product fix has been made for this failure, and it is not classified as benign or resolved. The transient split between native disclosure state and React's hidden wrapper is observed; a persistent stall in the initial run remains only a hypothesis. A remount during initial hydration, a locale change, and a WebKit role-query discrepancy likewise remain unproved for that run and did not occur in these diagnostics.

Further work should use these traces and instrumented harness during independent review, retaining the first failure. Publication remains pending that review and completion of the screenshot-dependent work. The four new user images are still not downloaded or inspected here because authorization for their transfer host remains pending. No deployment, production mutation or paid AI call occurred.
