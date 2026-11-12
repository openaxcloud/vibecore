---
id: BUG-QA-DATABASE-CAPTURE-001
---

# Database initial-loading response capture

## Status

Local test-harness correction and bounded first-attempt diagnostics prepared. No product correction, publication, or live verification is claimed. The cause of the observed CI flake remains unproven.

## Selective main port (2026-11-12)

The three TypeScript files are copied byte-for-byte from the validated capture correction at experimental head `f4956eaf6f65f714e513040652a080b858a6a4ee`, following `e3bdf79b0ac37338549e1019d3663d73dc46b74f`. This does not import the experimental branch or its product changes.

Target main `31ed1f1deefd85592f27b5fa1fe57465cf03b0ab` still has the original scenario blob `11b22e62da6f659aca388937ae16cbef6e0e0038` and neither helper nor its unit test. Its French first attempt failed at line 150 after 60 seconds (`responses.length`: expected 1, received 0); retry 1 passed in 11.7 seconds. The retained result JSON lists an error-context attachment but no first-attempt trace; the attachment contents were not retrieved. A successful retry does not prove the first-attempt cause.

Historical real E2E evidence is separate: the e3 run `43125221191` passed the Database contexts first attempt. The f495 Production E2E run `43133045130` used merge-ref `cb2392b`, not the exact runtime branch head; its EN/FR Database contexts passed first attempt in 9.1/8.9 seconds. These are prior evidence for the unchanged correction, not live validation of this main port. No new browser, provisioning, workflow rerun, publication or deployment is performed here.

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

## Verification and limits of this main port

- 27 local unit tests pass, including transport matching, schema exclusion, setup ordering, unchanged buffers, early delivery, duplicate requests through teardown, altered bytes, handler errors, cancellation, cleanup ordering and primary-error identity.
- Nine negative mutations are detected: native-only capture, late arming, early delivery, swallowed fetch errors, primary-error overwrite, disposal ordering, cancelled-request fulfillment, followed redirects and late duplicates hidden during teardown.
- Strict focused TypeScript, the unmodified repository ESLint preset on all three changed TypeScript files and authored-file formatting pass. These focused checks are not a full repository build, lint or typecheck pass.
- All six inventory guards pass. The official generator produces 625 entries, retains existing notes and is idempotent.
- No local browser launch, real QA Database E2E, full repository build/test/typecheck, workflow rerun or cloud provisioning was performed for this port. The prior denied Chromium socket launch was not retried. Prior Playwright SDK serialization, collection, metadata guards and experimental real E2E evidence belong to the historical correction and are not new main-port run results.
- The exact first-attempt failure mechanism remains unproven. No product code, business expectation, timeout or retry setting is changed.

## 📤 Dispatché

Independent review and local correction of the Database response-capture oracle.

## 💻 Codé

Local selective port prepared on `31ed1f1deefd85592f27b5fa1fe57465cf03b0ab`. Not pushed or merged. No product code, retry count, timeout budget, synthetic success, or database payload changed.

## ✅ Testé live

This main port is not verified live. Historical experimental evidence is recorded separately above. Local unit, SDK serialization, type, lint, formatting, collection and guard results are distinct from a real Database browser run.
