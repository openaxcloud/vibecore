# Targeted QA after main integration

The compiled application and restarted local API both used commit `334f9821a76b7fc844b14f488d08069c2677c1b7`. Six targeted browser tests passed in 94.513 seconds with two workers, no retries, no skips and no flaky results. Source, test and compiled-file hashes remained unchanged after the run. Later test/documentation-only changes do not change this receipt’s provenance.

Coverage: mobile Domains navigation, invalid legacy Domains POST, Publish entry points, unavailable detection and explicit override, double-click submission with actionable error/retry, responsive draft retention, confirmation cancellation, and interrupted navigation followed by browser Back/Forward. Publication responses and deployment history were controlled; no external deployment or DNS mutation occurred. The captured mobile Publish form shows retained values while detection restarts after resizing; it does not establish successful framework detection.

This targeted run does not replace the earlier full 19-case receipt or establish production validation. The earlier CI Back failure remains causally unresolved: its unchanged assertions passed locally with passive observation. Local Chromium 154 differs from CI Chromium 147, whose attempted public download was blocked. The observation JSON normalizes opaque keys as K1/K2/K3, preserving equality and order. Raw logs, traces, fixture credentials and identifiers remain outside this evidence directory.

The two screenshots were visually inspected. All local QA servers, disposable containers and their anonymous volumes were subsequently removed; ports 3017, 5198, 55447 and 56387 were verified closed. No real user data was used.
