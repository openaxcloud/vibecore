# Automatic Agent edits — local evidence

This branch changes the Agent editing policy: technical validation precedes automatic application; a legacy manual-review preference cannot restore Accept/Reject controls. Recovery details offer only a guarded retry. Conflicted, truncated, streaming and restored proposals with unknown provenance cannot be forced through that action. The existing staging pipeline, file locks, validation and confirmed-write receipts remain in place.

A failed missing-import proposal previously disappeared when its dependency arrived, although the importer had never been written. The regression was reproduced before the fix (`automatic-import-before.log`: one failing regression). The proposal is now retained. A complete live proposal may receive one dependency-triggered retry per emitted-content fingerprint; it must still pass validation and actual write confirmation. Structured missing-import metadata avoids interpreting translated error strings. Historical proposals remain protected.

Automatic batches sort dependencies first. Application rechecks the live proposal before writing and preserves unsaved user edits as conflicts. Retry never bypasses provenance checks. The successful dependency-recovery test also invokes the real store's revert method and verifies that the in-memory runtime adapter contains the original file afterward. This is a store integration test, not a production filesystem write.

## Validation scope

- 149 targeted tests passed across 14 files, including stale-proposal cancellation, real-store revert, conflict, interruption, truncation, dependency recovery, legacy preference and recovery UI checks.
- Production frontend and SSR build passed on the final product changes.
- Six bug-index checks passed.
- Monorepo typecheck passed. BaseChat's existing typecheck exclusion was preserved; it was not introduced by this change.
- App lint passed with zero errors and 52 existing warnings.
- No paid model calls or production data mutations.
- Browser harness `compiled-recovery.cjs` uses the production build with synthetic proposals and a read-only local API fixture. It blocks other origins, writes and sockets. Its injected reference exposes the existing workbench; it does not replace the product component. It checks absence of manual approval, disabled unsafe retries, keyboard details, and viewport containment. Browser results do not establish actual file restoration; that is covered by store integration tests.

## Browser outcomes and limitation

Chromium 154.0.8037.57 and WebKit 26.4, widths 390/393/430/1440 × 852, then landscape 852 × 393. The first eight cases passed their initial assertions. Additional keyboard checks scroll to and open the last file disclosure, then return to the outer summary. That stronger series passed 7/8: WebKit desktop once exposed zero retry buttons after opening details. The same case passed an isolated diagnostic and six further traced attempts without changing product code or weakening assertions. The initial failure is retained in `browser-expanded-details.json`; its cause is **unproven**, not declared resolved. Six traces remain at `/workspace/auto-review-browser-repeat/webkit-1440-{1..6}.zip`. These were deliberate diagnostic runs, not automatic Playwright retries.

Synthetic screenshots were inspected for Chromium desktop and WebKit mobile. They are not the user's images. The bottom menu remains visible in the mobile captures. No claim of full capture conformity or production readiness is made while the image-access and intermittent WebKit limitation remain.

## Pending

The four new user images (IMG_0944–0947) have not been downloaded or inspected in this environment. Library preparation returned transfers on sdmntprwestus3.oaiusercontent.com, absent from the effective allowed-host policy. Access approval is pending; no download or alternate transfer was attempted. No screenshot-specific visual conformity, physical iPhone, native keyboard, deployment or production validation is claimed.

Further investigation: [WebKit diagnosis](webkit-diagnosis.md). Sixteen additional traced pages, including concurrent proposal refresh and 40 keyboard close/open cycles, did not reproduce the failure. Its cause remains unproved; no product fix or resolution claim is made.
