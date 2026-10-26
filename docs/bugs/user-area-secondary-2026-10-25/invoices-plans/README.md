# Invoice numbers: local responsive correction

Worktree `vibecore-ui-followup`, branch `fix/user-area-secondary-responsive-20261025`, base `71d080c9c`. The only product edit adds `max-w-full` to the existing `min-w-0 break-words` invoice-description wrapper in `app/routes/invoices.tsx`. PR792's separate worktree and shared dependencies were not modified. No financial behavior, invoice link, amount, status or translation changes.

## Reproduced problem and baseline

A long synthetic invoice number makes the description800.80px wide inside a255px row at320px viewport; its right edge reaches833.30px. The number is clipped instead of wrapping within the card. `document.scrollWidth` misleadingly remains320 because the overflow is hidden higher in the layout. The browser proof therefore measures overflowing children as well as document width.

`before/receipt.json` covers40 cases: `/invoices` and `/plan-comparison`, FR/EN, light/dark, at320×740,390×844,844×390,820×1180 and1440×900. Eight invoice cases at320/390 reproduce the clipped number; no plan-comparison overflow or page errors were observed. Four keyboard groups focus the plan CTA, Tab to the next control without submitting, press Escape, and use native Back to invoices.

`before/zoom.json` adds8 native200% cases, both routes ×FR/EN ×light/dark. Physical window1280, inner640 CSS px, DPR2, visualViewport.scale1. CDP screenshots preserve the physical window. Zoom does not separately collect pageerror events.

`before/recovery.json` covers two FR/EN invoice GET503 failures, followed by keyboard Enter on Reload invoices after the synthetic endpoint recovers. No checkout, downgrade, portal, payment or download action was activated.

`before/counterproof.json` and the `dom-counterproof` image are **DOM-only experiments**, not final-build evidence. Setting max-width100% constrains the long-number wrapper to255px/right287.5px at320 and allows complete wrapping. Comparison also covers390,844,820,1440. The source change now implements that same bound; compiled after-evidence is now recorded under `after/` (app7599).

## Validation completed and pending

- 22 existing tests pass: user-area copy, async states, async boundary guard, and plan-comparison checkout error contracts. See `targeted-tests.txt`.
- Targeted ESLint on invoices passes; diff whitespace check passes.
- No CSS-string mirror test added.
- Parent reported consolidated build/typecheck/lint exit0 before starting app7599. Browser rerun against that compiled source change now passes88 cases,8 native200% cases and2 invoice retry paths. No production validation is claimed.

## Reusable synthetic harness

Run from the followup repository root with its existing Playwright dependency and `/usr/bin/chromium`. Do not install or alter shared dependencies. The scripts block external browser origins and financial submissions. The fixture rejects all non-GET requests with503. Data is entirely synthetic, including the deliberately long invoice number; no client data or real invoice was used.

`harness/fixture.cjs` defaults to isolated API3399 and reads `harness/extra.json`. Optional variables: `UI_FIXTURE_PORT`, `UI_FIXTURE_FILE`, `UI_FIXTURE_FAILURE`. Do not reuse an already occupied port or modify API3199/3299. To reuse the original running3399 fixture, set `UI_FIXTURE_FAILURE=/tmp/account-next/invoices-plans/fail` for the recovery script; otherwise use the same failure marker for the newly launched fixture and recovery script.

Start the parent-approved compiled app against that isolated API, then run:

```sh
UI_BASE_URL=http://127.0.0.1:7199 UI_EVIDENCE_DIR=/tmp/invoices-after UI_ASSERT_FIXED=1 node docs/bugs/user-area-secondary-2026-10-25/invoices-plans/harness/audit.cjs
UI_BASE_URL=http://127.0.0.1:7199 UI_EVIDENCE_DIR=/tmp/invoices-after node docs/bugs/user-area-secondary-2026-10-25/invoices-plans/harness/zoom.cjs
UI_BASE_URL=http://127.0.0.1:7199 UI_EVIDENCE_DIR=/tmp/invoices-after node docs/bugs/user-area-secondary-2026-10-25/invoices-plans/harness/recovery.cjs
```

The old7199 build is baseline only; replace the URL with the future corrected server before asserting the fix. `UI_ASSERT_FIXED=1` asserts both child containment and document width. `counterproof.cjs` is retained solely to explain the original DOM experiment and must not substitute for testing the compiled fix.

Limitations: synthetic long numbers and existing FR/EN product copy only; no production authentication, real Stripe invoice, successful financial action, Safari/Firefox, virtual keyboard, screen reader, exhaustive status/currency coverage or global UI verdict. No index, commit, push or build was performed by this subtask.

## Completed after-build expansion on7599

The reusable audit harness now targets **88 cases**: both pages × FR/EN × light/dark ×11 formats:320×740,360×800,390×844,844×390,768×1024,820×1180,1024×768,1280×800,1440×900,1920×1080,2560×1440. Historical before/receipt.json remains the original40-case baseline; it has not been rerun or expanded. After-build work also includes8 native200% cases and2 invoice GET503→keyboard Retry recoveries.

Parent's planned corrected app is7599 with the existing isolated API3399. The parent confirmed readiness before this run; reuse the commands below only against an equivalent ready synthetic environment. Recovery uses the existing3399 fixture failure marker, not another agent's API state.

```sh
UI_BASE_URL=http://127.0.0.1:7599 UI_EVIDENCE_DIR=/tmp/invoices-after UI_ASSERT_FIXED=1 node docs/bugs/user-area-secondary-2026-10-25/invoices-plans/harness/audit.cjs
UI_BASE_URL=http://127.0.0.1:7599 UI_EVIDENCE_DIR=/tmp/invoices-after node docs/bugs/user-area-secondary-2026-10-25/invoices-plans/harness/zoom.cjs
UI_BASE_URL=http://127.0.0.1:7599 UI_EVIDENCE_DIR=/tmp/invoices-after UI_FIXTURE_FAILURE=/tmp/account-next/invoices-plans/fail node docs/bugs/user-area-secondary-2026-10-25/invoices-plans/harness/recovery.cjs
```

Run recovery after the normal/zoom matrices finish, because its controlled invoice GET outage would otherwise contaminate simultaneous observations. No baseline or already-passing unit test rerun is required for this expansion.

## After result: compiled corrected source,7599/API3399

Completed successfully: **88 fixed-size observations**, **8 native200% observations**, **2 keyboard invoice retry paths**. `after/receipt.json` contains no overflowing child elements and no document overflow; the standard browser run recorded zero page errors. Native zoom retained inner640/DPR2/visualScale1. `after/recovery.json` records FR/EN GET503 failure panels followed by Enter on Reload invoices and restored invoice rows.

`after/invoices-320.png` was visually inspected: the entire long invoice number wraps inside the card, and invoice status, amount and actions remain visible. This screenshot comes from the actual corrected compiled app, not DOM style injection. Desktop and landscape are included in the same matrix. The initial8 mobile overflowing cases have no equivalent overflow after the fix.

Recovery ran only after both geometry/zoom matrices completed. The isolated3399 failure marker was removed afterward, restoring its normal invoice fixture. No API3199/3299 fixture was touched. No financial action, POST, downgrade, download or external invoice link was activated. All Chromium sessions ended before the parent was notified it could proceed to another build. Runtime fixtures remain synthetic; no production behavior is inferred.

After capture coverage:22 FR/light fixed-size screenshots (both routes ×11 dimensions),8 native-zoom screenshots (both routes ×FR/EN ×light/dark),2 FR/EN error-panel screenshots. Logs: `after/audit.txt`, `after/zoom.txt`, `after/recovery.txt`. Baseline and DOM-only counterproof remain under `before/`; none was relabelled as compiled proof.
