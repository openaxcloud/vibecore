# Member identities and API-key metadata — secondary UI work

`app/routes/organization-members.tsx` changes: two member identity text lines use `break-words` instead of `truncate`, allowing full names and email/domain/role text to wrap. A subsequent authorized one-class change adds `relative` to the API-key table scroller, described below. No membership/invitation action, role logic, key lifecycle logic or shared navigation changed. Parent confirmed29 open PRs do not own this route before authorizing the edit. Work is isolated to `vibecore-ui-followup`; PR792 remains untouched.

## Before evidence and scope

`before/receipt.json`:40 cases, both `/organization-members` and `/api-keys` ×FR/EN ×light/dark ×320×740,390×844,844×390,820×1180,1440×900. App8099 uses the stable next compiled build with independent synthetic API3799. No document/unintended child overflow, no JavaScript errors and no attempted mutation. Intended desktop API-key table scrolling is excluded from unintended-overflow classification.

Member readability defect: at320, the synthetic name has1305px content in262px and email+role431px in262px, both ellipsized with no title or expansion in the list. Full text is still present in the DOM/accessibility tree; this is a visual identification issue, not a claim of screen-reader data loss. `before/counterproof.json` is a DOM-only experiment: normal whitespace/wrapping fits identities at320,390,820,1440. At320 the very long name grows20→119px high; taller rows are the intentional tradeoff. The `dom-counterproof` screenshot is **not** evidence from the compiled source fix.

API-key audit found no defect in this scope: long mobile names wrap, and the desktop table has a focusable horizontal-scroll region. `before/recovery.json` confirms ArrowRight scrolling18px in FR/EN; the standard audit's immediate0/1px readings preceded the animated scroll and are not failures. Existing key metadata fixture has no token and a null prefix. Nothing was created, revoked, copied or downloaded.

Four GET503→keyboard Retry paths pass: both pages in FR/EN at320. The isolated3799 outage marker is removed afterward. Four keyboard/Back groups focus the desktop table, press ArrowRight and Escape, then use native Back to members. No invitation, role change, ownership transfer, key mutation or modal create/revoke operation was performed. All browser mutations were blocked.

## Validation and after harness

Six existing organization-members i18n tests pass; targeted lint and diffcheck pass. See `targeted-tests.txt`. No CSS-string mirror test was added. The parent supplied the consolidated8399 build, then8599 after the API-key scroller correction. Results are separated below.

After harness expands to88 cases: both pages ×FR/EN ×light/dark ×11 formats:320×740,360×800,390×844,844×390,768×1024,820×1180,1024×768,1280×800,1440×900,1920×1080,2560×1440. `UI_ASSERT_FIXED=1` checks actual identity text widths, child/document containment, then keyboard scroll and Back. Four GET retry paths follow the matrix to avoid contaminating it with the controlled outage. No baseline or passing unit suite needs rerunning.

From repository root with existing Playwright/Chromium, after the corrected app is ready:

```sh
UI_BASE_URL=http://127.0.0.1:8399 UI_EVIDENCE_DIR=/tmp/members-keys-after UI_ASSERT_FIXED=1 node docs/bugs/user-area-secondary-2026-10-25/members-keys/harness/audit.cjs
UI_BASE_URL=http://127.0.0.1:8399 UI_EVIDENCE_DIR=/tmp/members-keys-after UI_FIXTURE_FAILURE=/tmp/account-next/members-keys/fail node docs/bugs/user-area-secondary-2026-10-25/members-keys/harness/recovery.cjs
```

`harness/fixture.cjs` and `extra.json` reproduce the synthetic GET contracts; default port3799, optional `UI_FIXTURE_PORT`, `UI_FIXTURE_FILE`, `UI_FIXTURE_FAILURE`. Reuse the isolated running3799 rather than binding an occupied port. All non-GET fixture requests are rejected. No API3199/3299/3399 state is changed by this harness. No dependency install, build, index, commit or push is performed by this subtask.

Initial audit limits: no production access, real key/invitation operations, native zoom (subsequently covered below), virtual keyboard, Safari/Firefox, screen-reader announcement checks, or modal form coverage. The visual identity fix does not imply validation of the entire membership or API-key lifecycle. Shared header/sidebar truncation is outside this patch.

## Initial corrected build8399: members pass, API-key desktop issue found

This run is **not an all-green recipe**. `after-initial/receipt.json` contains all88 cases and12 failures: API-key page at1280/1440/1920 in FR/EN/light/dark has document-level horizontal overflow. All44 member cases retain full contained identities. Four GET503→keyboard Retry cases pass, no JavaScript errors or mutations recorded. The preliminary harness selector was narrowed to membership rows containing `input[name=userId]`, because pending invitations also use grid rows; that selector issue was not a product failure. Assertions now accumulate all case failures and still exit nonzero, preserving the complete matrix.

Precise API-key cause: the desktop table's visually hidden Actions heading (`span.sr-only`, position:absolute) uses BODY as offsetParent. At1280 its right edge is1832.72px, outside the table scroller's clipping context; html.scrollWidth becomes1833 although body and visible layout remain1280. The overflow remains after500ms, so it is not only resize animation. See `after-initial/api-keys-absolute-header-counterproof.json` and screenshot.

DOM-only counterproof: adding `position:relative` to `data-testid=api-key-table-scroll-region` returns document width to1280 without removing/reflowing table columns. The parent subsequently authorized this single-class correction; `relative` is now applied only to the existing table scroller. Columns, aria-label, tabIndex and keyboard scrolling are preserved. The failed88-case receipt remains intact. The initial baseline API-key audit's document widths did not reproduce this: its theme/resize ordering and timing differed; the complete failed after matrix and standalone fresh-navigation reproduction supersede any broad no-defect inference.

Native200% coverage for these pages is now prepared in `harness/zoom.cjs` (8 cases,2pages ×FR/EN ×light/dark); run it after the eventual corrected build, in addition to the88 fixed-size cases. No zoom success is claimed yet.

## Follow-up correction and final browser pass

API-key scroller now has `relative`; no permissions/action/creation/revocation/copy logic changed. Ten existing API-key i18n/reauth tests and targeted lint pass (`api-keys-relative-tests.txt`). No new test mirrors a CSS class. The parent subsequently reported final build and strict typecheck exit0 and supplied app8599.

The final recipe ran **44 API-key cases only**,8 native200% cases across Members/Keys, and2 API-key GET503 retries. `UI_KEYS_ONLY=1` selects this scope in both audit and recovery harnesses. For native Back the audit first visits members, but does not remeasure or count that page. The44 member fixed-size successes remain attributed to8399; they must not be reported as replayed on the future build. The initial12 failing API-key cases remain in `after-initial/`.

## Final result on8599/API3799

**All final scoped checks pass.** `after-final/receipt.json`:44 API-key observations (11formats ×FR/EN ×light/dark), zero failures, no page errors, no attempted mutations. The12 failures preserved in `after-initial/` are resolved. The44 successful Members fixed-size cases still belong to8399; they were **not replayed or counted as8599 geometry cases**. The final harness visits Members solely as the browser Back destination before measuring Keys.

`after-final/zoom.json`:8 native desktop200% observations (Members/Keys ×FR/EN ×light/dark), physical window1280/inner640, DPR2, visualViewport.scale1, document width640. No device-scale emulation or CSS zoom substitutes were used. Zoom does not separately collect pageerror events.

`after-final/recovery.json`:2 API-key GET503→keyboard Retry cases FR/EN; fixture3799 restored afterward. All browser non-GETs remain blocked. No real key, invitation, mutation, clipboard access, download or external request was used.

`after-final/table-semantics.json`:FR/EN at1280, all6 table headings and6 data columns preserved. Hidden Actions header retains its text and now uses the relative scroller as offsetParent. Accessible region label, role=region and tabIndex0 remain present. Focus and ArrowRight horizontal scroll succeed; after scrolling to the end, the action column is visibly reachable without activating its button. Document width stays1280. Two supplementary screenshots show the table end.

Captures:11 FR/light API-key fixed-size images,8 native-zoom images,2 error-panel images and2 table-end images. Logs accompany the receipts. Browser processes finished and the parent received GO before any next build. No source, index or commit was modified during this recipe.

To repeat the final scope against an equivalent ready synthetic app, set `UI_BASE_URL` to that app and use separate output:

```sh
UI_BASE_URL=http://127.0.0.1:8599 UI_EVIDENCE_DIR=/tmp/members-keys-final UI_ASSERT_FIXED=1 UI_KEYS_ONLY=1 node docs/bugs/user-area-secondary-2026-10-25/members-keys/harness/audit.cjs
UI_BASE_URL=http://127.0.0.1:8599 UI_EVIDENCE_DIR=/tmp/members-keys-final node docs/bugs/user-area-secondary-2026-10-25/members-keys/harness/zoom.cjs
UI_BASE_URL=http://127.0.0.1:8599 UI_EVIDENCE_DIR=/tmp/members-keys-final node docs/bugs/user-area-secondary-2026-10-25/members-keys/harness/table-semantics.cjs
UI_BASE_URL=http://127.0.0.1:8599 UI_EVIDENCE_DIR=/tmp/members-keys-final UI_KEYS_ONLY=1 UI_FIXTURE_FAILURE=/tmp/account-next/members-keys/fail node docs/bugs/user-area-secondary-2026-10-25/members-keys/harness/recovery.cjs
```

Run recovery last so the intentional GET outage cannot contaminate the other observations. The original limitations remain: no production or real key lifecycle validation, virtual keyboard, Safari/Firefox or screen-reader announcement test.
