# Profile exploratory audit — local build6899

Read-only audit of `/account-settings` profile, FR/EN/light, synthetic API3199. No source edit. The browser uses a long unbroken name and `America/Argentina/ComodRivadavia`; displayed detected timezone is its browser-canonical alias `America/Catamarca`.

Per language: resize320→820→390→1440→320 (height568), confirm no document overflow and capture values; enter an invalid timezone and Tab to expose the inline error/aria-invalid; correct timezone and save. The synthetic API rejects the request with503. Two observed saves in the final receipt, one per language; an earlier identical audit also made two rejected saves. No mutation succeeded and no real account was used.

Results: long-name draft and timezone preserved through resizing and503; error alert visible at y155–211 within568px. No page errors. Focus becomes BODY after the save button is disabled during submission; pressing Tab once still records BODY, not a navigation link. This observation does **not** prove that the keyboard flow restarts at the navigation, nor establish a blocking keyboard defect. No corrective delta was applied. The original offscreen-alert hypothesis was not reproduced.

The probe checks browser field validation and locale-specific copy, not a live language-selector interaction. It does not cover dark mode, native zoom, production save success, assistive-technology announcements or virtual keyboards. Existing account/data evidence is separate. A browser-context language rerender in payment recovery unit tests does not extend this profile browser coverage.

Run from repository root with installed Playwright and local Chromium against the synthetic API only:

```sh
UI_BASE_URL=http://127.0.0.1:6899 UI_EVIDENCE_DIR=/tmp/profile-rerun node docs/bugs/user-area-2026-10-25/profile/probe.cjs
```

`receipt.json` is the authoritative measurement. The script additionally records `document.hasFocus()` on future runs; that additional field was not present in this receipt. BODY text containing application boot markup was omitted from the archived receipt because focus tag/name/href suffice for this observation.
