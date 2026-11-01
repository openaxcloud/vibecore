# Mobile README / immediate Back — 2026-11-01

Base: PR #883, `5dea2523b68b36adf6709bd28c7576c31cb3198f`. Work is isolated on `fix/mobile-readme-back-race-20261101`; #883 is not modified.

## CI evidence

Run [41324580959](https://github.com/openaxcloud/vibecore/actions/runs/41324580959/job/124901839124), scenario `ide-mobile-file-restore.spec.ts:518`: `explicit provisional README then immediate Back at 390`. The first attempt failed at the unchanged `.cm-content` visibility assertion after `page.goBack()` (5 s timeout). Its accessibility snapshot showed Library and the README content, but no CodeMirror. Retry 1 passed; the correct verdict is flaky. The CI configuration only records a trace on the first retry, so it did not preserve the failed attempt's chronology.

## Local reproduction and cause

The unmodified production build of the exact base ran against a real local API, fresh PostgreSQL database and Redis. The test creates/imports synthetic projects through those services. Existing test guards block models/runtime calls and external browser requests; provider keys were empty. No production project was used.

Ten repetitions with no added latency passed (zero retries). A diagnostic variant then delayed the real response to the editor panel navigation by 750 ms; all three repetitions failed at the same visibility assertion, with the same Library snapshot. This is below the original 5 s assertion timeout. No assertion was changed, weakened or removed.

The failed first-attempt trace proves the sequence: selecting README starts `ide.data?panel=editor&_routes=root`; the mobile Back button navigates to dashboard before that root response commits. The interrupted panel change leaves `panel=files` as the previous history entry. Browser Back therefore restores Library rather than Editor, although README was correctly selected. The returned file data is not the problem. `before-receipt.json` includes sanitized navigation snapshots and request status, and `before-library.jpeg` is the last captured frame, inspected in pixels.

This proves a product race under the tested latency and matches the CI symptom. It cannot prove that the unrecorded CI first attempt had exactly the same timing.

## Correction

The root loader only supplies locale and SEO metadata, which do not depend on `panel`. Its revalidation policy now skips a change of that parameter alone **when entering Editor** within the same IDE route, including canonical and slug URLs. Other panel transitions retain their existing behavior. Opening Editor can commit without a root network round trip before the next user action. Route changes, changed locale/other parameters, forms, and explicit same-URL revalidation retain the router's decision. The project loader already excludes client panel changes; it is unchanged.

The existing Back test retains every original assertion. It additionally runs the delayed-response variant at both 390 and 768 px. These delayed cases remain in CI as regression coverage.

## Validation and limits

Local browser: system Chromium 154.0.8037.57, Playwright 1.59.1, Debian 13. Downloading Playwright's Chromium 147 was denied (`403 Domain forbidden`); no retry or policy bypass was attempted after that installer exited. This is a browser-version difference from CI. Mailpit's health check did not become healthy; registration and the tested file APIs succeeded without email delivery. PostgreSQL and Redis were healthy.

Build, web typecheck, changed-file lint, 53 root/locale/route tests, six bug-index tests and the built root critical-path guard passed. **Final compiled correction: 18/18 Chromium restoration tests passed, plus 6/6 extra 390 px repetitions (normal and delayed response, three of each), all with retries=0 and exit 0.** This includes locale/Back/Forward/reload, project isolation, pending archive restoration and both unchanged pending-Files-navigation tests. `after-receipt.json` records each verdict and source hashes. The final 390 px trace has no editor root-only request (`after-navigation-network.json`); the normal full route response remains. Both after screenshots were inspected in pixels. The initial broader-policy experiment also passed 12 cases, but is not counted as final-head evidence.

Raw local traces contain test-session authentication and remain outside the repository under `/workspace/readme-repro-baseline`, `/workspace/readme-repro-delayed-before`, and `/workspace/readme-repro-after`. Only sanitized receipts and UI images are committed. No physical phone, production validation or deployment is claimed.

The optional WebKit 26.4 run failed all four cases at the login precondition, before file selection: the compiled production server emits a Secure session cookie over local HTTP, and the subsequent WebKit dashboard request does not send that cookie. Its trace confirms the cookie attributes and missing session cookie without exposing its value. These are not passing WebKit restoration tests; authentication was not weakened to make them pass.

## Reproduction command

Start the local API/database and compiled app as in `.github/actions/preparer-pile-e2e/action.yml`, with empty model-provider keys. Then:

```sh
SAAS_API_URL=http://127.0.0.1:3001 \
PLAYWRIGHT_BASE_URL=http://127.0.0.1:18210 \
pnpm exec playwright test tests/e2e/ide-mobile-file-restore.spec.ts \
  --config=docs/bugs/mobile-readme-back-20261101/playwright.local.config.ts \
  --grep 'explicit provisional README then immediate Back' --retries=0
```

The local config records every first-attempt trace. `README_BROWSER` can select an already installed Chromium executable. It changes neither test assertions nor timeouts.
