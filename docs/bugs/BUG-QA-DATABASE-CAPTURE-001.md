---
id: BUG-QA-DATABASE-CAPTURE-001
---

# Database initial-loading response capture

## Status

Local test-harness correction and bounded first-attempt diagnostics prepared. No product correction, publication, or live verification is claimed. The cause of the observed CI flake remains unproven.

## Observed failure

At `7cf6dace8f3dfb4aa889ab28cd88f6bd59d1141f`, E2E run `43113095871` passed its gate with one flaky English Database context test. The first attempt waited 60 seconds for `responses.length === 1`; the retry and French scenario passed. The first-attempt DOM already contained a real `DATABASE_URL` card and “Status unavailable.” Only the retry trace was retained.

The first-attempt database API calls returned 200 in 162.7 ms and 22.7 ms, about 60 seconds apart. This does not measure the complete panel loader, which also reads dashboard, environment variables, secrets, and snapshot summaries. It does not establish a slow backend or identify the first browser transport.

The same relevant test and product blobs are present at `f314ff07df4e9acb25ae47b95a3086cd4410b03d` and `6084cb9fc3af80ad91d024031d029db9ff69681e`.

## Source review

- The IDE document preloads only `snapshots` and `settings`, not Database.
- The wrapper fetches the native Database panel URL. Its cache and single-flight keys include the project and panel. The `hasCommittedPayloadRef` correction is already present in the failing revision.
- The child receives the parent data. Its independent list refresh and schema reads use React Router's fetcher, whose network transport can append `.data`.
- The retry's observed `.data` request has `schemaKey` and `_routes`: it is a schema read, not evidence of a duplicate list request.
- The old test installed its route after navigation and environment setup, accepted only the native path, and recorded readiness only after both `route.fetch()` and body reading. Zero records could therefore mean a missed request or a failed handler, not necessarily a pending product response.

No causal link with the separate dashboard Settings shell flake has been established.

## Harness change

1. Create and verify the real database binding, then arm capture before navigation or hydration.
2. Retain both native and `.data` list responses. Keep schema requests separate. Preserve the real status, headers, and exact body bytes; create no database payload.
3. Count browser requests independently from the intercepted upstream fetch. A child `.data` list cannot disappear from the reuse assertion. Reject duplicate initial requests, unheld responses, and handler failures.
4. Keep existing test, initial-response, six-second pending-state, and UI assertion limits. No retries or assertions are removed.
5. Preserve the exact first thrown scenario error while attempting every cleanup step. Unroute before draining handlers, remove observers even if route setup or removal fails, and do not fulfill browser-cancelled requests. Continue recording late double lists until teardown ends.
6. Disable automatic upstream redirects as well as retries, so a redirect cannot silently create another fetch or become a retained 200. A non-200 response fails the oracle.
7. Attach bounded diagnostic snapshots before and after cleanup on every attempt. Store fixed phases/categories, relative times, counts, status codes, and byte lengths only. Never store URLs, IDs, headers, bodies, fingerprints, or upstream exception messages. A failed attachment falls back to the same safe JSON in the test log.

## Verification and limits

- 27 unit tests cover transport matching, schema exclusion, setup ordering, unchanged-buffer retention, early delivery, duplicate requests including teardown, altered bytes, HTTP and handler errors, cancellation, late upstream completion, cleanup ordering and error identity, unchanged timeout, bounded diagnostics, and observer cleanup.
- Nine mutation checks fail as intended, including the frozen scenario that overwrites its primary error and the frozen teardown ordering. The unindexed original bug note separately fails two inventory guards.
- The installed Playwright 1.59.1 matcher and actual fulfillment serialization preserve both transport matches, status 200, headers and exact binary bytes in a local SDK contract check. This is not a browser run.
- Strict focused TypeScript, the complete unmodified repository ESLint preset on the three changed TypeScript files, formatting, and EN/FR Playwright collection pass. The root lint command itself only selects `app`.
- Root CI runs `pnpm run test`; its Vitest exclusions include `tests/e2e/**` but not `tests/database-response-gate.spec.ts`. Focused Vitest collection passes. Actual root configuration collection remains blocked by absent `build-config/catalogues-i18n-plugin`, `build-config/manual-chunks`, and `legacy-marketing-entry.mjs` in this partial checkout; it is not claimed successful.
- All 26 existing desktop/mobile/Database metadata guards and all six inventory guards pass. The generated bug index includes this entry and preserves all prior entries.
- Actual browser/HTTP fixture validation was blocked in the earlier attempt because installed Chromium could not create its Unix socket. That failed launch was not repeated. Neither the real QA Database E2E nor a full root build/test/typecheck has run for this patch. The exact first-attempt mechanism still needs evidence from an authorized real run.

## 📤 Dispatché

Independent review and local correction of the Database response-capture oracle.

## 💻 Codé

Local standalone patch prepared on `6084cb9fc3af80ad91d024031d029db9ff69681e`. Not pushed or merged. No product code, retry count, timeout budget, synthetic success, or database payload changed.

## ✅ Testé live

Not verified live. Local unit, SDK serialization, type, lint, formatting, collection and guard results are distinct from a real Database browser run.
