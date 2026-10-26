# Payment method and upgrade: local UI evidence, 2026-10-25

These are synthetic local browser observations, not production acceptance or evidence of a completed payment. Before: compiled commit `234f801f1`, app `127.0.0.1:6199`. After: parent-built frozen working tree based on that commit, app `127.0.0.1:6799`, including the route-local recovery and CTA changes. Both used the synthetic API at `127.0.0.1:3199`. No Git commit or deployment is implied by this directory.

## Coverage and results

| Surface | Viewports | Languages/themes | Before | After |
| --- | --- | --- | --- | --- |
| `/upgrade` | 320, 390, 820, 1440 CSS px | FR/EN × light/dark | No document overflow; Team CTA 34px at 320/390/820 and 32px at 1440 | No document overflow; all plan buttons at least 44px (44 or 56px when text wraps) |
| `/payment-method` | 320, 390, 820, 1440 CSS px | FR/EN × light/dark | No document overflow | No document overflow |
| Both pages, native desktop zoom 200% | Physical window1280, inner640 CSS px | FR/EN × light/dark | DPR2, visualViewport.scale1 | Same metrics; no document overflow; upgrade buttons44px |
| Email draft and error recovery | 320→820→390→320 | FR/EN, two failed saves each | A503 removed the form; Retry reloaded it with empty draft | Four submissions returned actual HTTP503; same email draft retained; alert focused and in viewport after both failures; Tab proceeds to portal button, then email input |

The standard matrix contains **32 cases** (2 pages ×4 widths ×2 languages ×2 themes). Zoom adds **8 cases**. No page errors were recorded in the standard matrix or recovery interactions. Zoom asserts dimensions and CTA height; it does not collect page-error events separately. Standard matrix captures are FR/light; zoom captures cover all8 cases. Recovery screenshots were taken after the subsequent Tab checks, so they show the email field focused; the preceding alert-focus assertion is recorded in the script and receipt.

The native zoom uses Chromium's ephemeral profile preference `partition.default_zoom_level.x = log(2)/log(1.2)`, not deviceScaleFactor, pinch emulation or CSS zoom. CDP screenshots capture the physical window without the CSS-sized screenshot crop. Chromium executable: `/usr/bin/chromium`.

## Error and security contracts

The synthetic API rejects every non-GET with503. The four after-browser POSTs were local billing-email saves only; no upstream mutation succeeded, no checkout/Stripe portal was opened, and no real customer data was accessed. No browser success is asserted or fabricated.

Successful retry is covered **only by the unit component test**, using the actual React Router action/boundary/form with a stubbed API. `payment-repeat-before.txt` demonstrates the original failure to refocus after a second identical503; `payment-repeat-after.txt` records14 passing targeted tests. The UI test also changes the i18n context FR→EN while the boundary remains mounted and verifies that this ordinary rerender does not steal input focus. This is a context-update test, not a browser language-menu test. Action tests preserve302 login/MFA redirects, portal503, invalid-email400 and portal redirects;500/503 email failures remain thrown HTTP errors with a validated draft envelope.

Recovery data is carried in the action error response and mounted UI. No localStorage/sessionStorage persistence for the email draft was added. The existing tour-dismissal fixture uses localStorage only to remove unrelated onboarding from screenshots.

## Reproduce

Run from the repository root with its installed Playwright dependency, a compiled app configured for the **synthetic** API, Chromium available, and fixture cookie `vc_session=synthetic-ui-fixture`. Required fixture GETs include `/auth/me`, `/orgs`, `/orgs/synthetic-org/billing`, and `/billing/synthetic-org` plan catalogue. The plan fixture used `free`, `pro`, `team`, `enterprise`, with synthetic annual-price IDs for pro/team. The fixture subscription status was lowercase `active`, so this evidence does **not** validate the production `ACTIVE` existing-subscription branch.

```sh
UI_BASE_URL=http://127.0.0.1:6799 UI_EVIDENCE_DIR=/tmp/payment-upgrade-rerun node docs/bugs/user-area-2026-10-25/payment-upgrade/after/audit.cjs
UI_BASE_URL=http://127.0.0.1:6799 UI_EVIDENCE_DIR=/tmp/payment-upgrade-rerun node docs/bugs/user-area-2026-10-25/payment-upgrade/after/zoom.cjs
UI_BASE_URL=http://127.0.0.1:6799 UI_EVIDENCE_DIR=/tmp/payment-upgrade-rerun node docs/bugs/user-area-2026-10-25/payment-upgrade/after/interactions.cjs
```

Use the `before` scripts against the original compiled baseline if comparing. Baseline `receipt.json` and screenshots come from the completed rerun after the catalogue fixture was configured; initial missing-fixture output was discarded.

Not covered: production authentication, real payment/subscription changes, successful browser save, real401/403 recovery, Safari/Firefox, virtual keyboard, assistive-technology announcements, touch hardware, or a global platform verdict. These scripts do not replace the parent's build/typecheck/lint and independent review.

## Complementary widths on final palette build6899

`extra/receipt.json` adds **56 nonduplicate cases** on the next compiled local build at `127.0.0.1:6899`; payment/upgrade source is unchanged from the tested6799 build. Exact viewport dimensions:360×800,844×390 (phone landscape),768×1024,1024×768,1280×800,1920×1080,2560×1440. Both routes ×FR/EN ×light/dark. No document overflow or page errors; every Upgrade plan button remains at least44 CSS px. No POSTs in this complementary matrix. Captures are FR/light at all7 dimensions for both pages.

Combined fixed-size coverage is **88 cases**, across11 dimensions, plus the8 native200% zoom cases above. The complement does not repeat the4 recovery submissions and does not establish virtual-keyboard behavior.

```sh
UI_BASE_URL=http://127.0.0.1:6899 UI_EVIDENCE_DIR=/tmp/payment-upgrade-extra node docs/bugs/user-area-2026-10-25/payment-upgrade/extra/audit.cjs
```
