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

Synthetic screenshots were inspected for Chromium desktop and WebKit mobile. They are not the user's images. The bottom menu remains visible in the mobile captures. These initial runs predate the authorized image access documented below; no production-readiness claim is made.

## Resumed validation — 2026-11-01

All four original images were materialized in this environment with the current official Library helper and inspected in pixels. Effective policy was `enforced`, observations current, and the configured version was `cecfgver_6ae7860917088192815422ded746a965`; only the specifically authorized new host was used. Identity, version, sizes and hashes are recorded in `capture-receipt.json`. No transfer URL is retained.

The images show iPhone Safari at 19:57, Power / two messages, with no identifiable project name. IMG_0944/0945 show clipped role cards, untranslated original report content and the overlapping down arrow, covered by the inherited #883 changes. IMG_0946/0947 show nine then three failed changes, manual approval controls, and missing-import/preview-paused errors. No project identity or physical-device validation is inferred.

The follow-up connects successful recovery results to the same accumulated Undo notification as initial automatic writes, for both chat and Agent Studio. Only `accepted` results are included; failed/ignored results never announce success. A UI integration test uses the real WorkbenchStore with an in-memory runtime adapter: failed → applying → accepted, confirmed contents, rendered Undo clicked, real revert called once with the original identity, original contents and `reverted` status verified. This is not production persistence.

Desktop/mobile pixel inspection also revealed the remaining one-button retry layout still using the old two-column review grid. Recovery now spans the action row, wraps long labels, bounds its scrollable list and uses a neutral error-recovery surface. The bottom menu is unchanged.

The browser harness additionally tests Retry → one visible Undo → revert callback at 390, 768 and 1440 widths and landscape. Its retry transport is explicitly synthetic; actual store writes are covered separately above. Requests outside the local fixture, mutations and sockets remain blocked.

WebKit 26.4 was downloaded to this environment but cannot launch with seven missing system libraries. The attempt to fetch those packages with APT reported a permission denial reading `/etc/apt/apt.conf.d/80-applied-apt-retries` and unavailable package metadata. No alternate installation route or new permission was attempted. The previously observed intermittent WebKit disclosure failure remains unproven and unresolved; previous successful repeats are historical, not a fresh WebKit pass.

No merge, rollout, paid model call, key/routing/budget change or production write was performed. Integration and production validation remain with the coordinator.

Further investigation: [WebKit diagnosis](webkit-diagnosis.md).

Final local checks: production build passed; monorepo typecheck passed (missing local workspace package links were restored in ignored node_modules only); final web typecheck passed after the added tests; lint passed with 0 errors / 52 existing warnings. Targeted suites: 88 tests in 10 files initially, then 98 visual/conflict/settings regressions in 6 files, then 95 focused tests including the new mixed-result and shared-toast tests (overlapping suites; do not sum these totals). Six bug-index checks also passed.
