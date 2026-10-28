# Publish UX browser receipt — 2026-10-28

Baseline main9ec6ebf75: exact build,14/14 first-pass responsive/canonical scenarios. Additional clipboard denial tests FR/EN320 both failed as expected: no status or manual input and buttons21×44px; successful second clipboard attempt still worked.

Final uncommitted candidate product is identified by sourcehashes.json. Build exit0, no tracked product source changed while building. First final suite:17 passed/1 failed, no retry or skipped case. Four clipboard cases passed (FR/EN320 and actual Chromium native200%): feedback, complete148-character URL selected, retry confirmation, Copy/QR44×44CSSpx. Five container widths with two sidebars and five natural viewport widths320/390/768/1024/1440 plus nativezoom layout passed. Real local unavailable detection/manualoverride, captured doubleclick/error retry, and cancel/rollback dialogs passed; provider mutations were browser-fulfilled, never sent.

One canonical navigation assertion failed at5seconds after topPublish. Trace final snapshot subsequently contains the requested Publish host/button and aliasURL with panel=deployments. This establishes an overlapping route transition, not its cause or a regression from the form change. A separate readiness probe failed BEFORE clicking because it wrongly expected automatic alias conversion; historicalURL remained stable. Neither failure has been suppressed, and the canonical durable test is unchanged.

New durable tests/e2e/publish-url-copy.spec.ts: two cases passed before formatting and both passed again on exact formatted/linted file; SHA25665d069c04ad08f78740f3d9f6a4c31fa3ed18e267b841a5996f864ce32b6e2d2. These are additional qualified executions, not eighteen original passes.

Intermediate build proof retained separately: four clipboard cases passed; canonical navigation passed, next case was manually interrupted when parent requested final loading-banner adjustment, final case unexecuted. No results from that build are represented as final-build coverage.

All fixtures isolated local API/Postgres plus browser-controlled deployment/domain GET and clipboard. No real DNS/provider publication, customer data or authenticated production testing. Native zoom measured Chrome defaultZoom and CDP zoom2, not CSSzoom or Safari hardware. Raw traces and session logs omitted.

Final authorized readiness probe: html[data-ecode-hydrated=true] passed, but the accessible Loading page status stayed count1 for5seconds; probe stopped before clicking. No additional retry or cause claim. The original17/1 result remains. Isolated services stopped; see cleanup.json.
