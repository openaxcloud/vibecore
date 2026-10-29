# Git custom-remote keyboard browser evidence — 28 October 2026

Base commit `6bdaeabe168217887a220a65816ec5344cbbc6ab`; local candidate `GitProviderConnectPanel.tsx` SHA256 `3ca167df0d1e62f68412b34f3e5cd1ceb854f88bf7afb8dcfe5d269cbc60a482`. Client and SSR build exited0;3064 tracked product/package hashes remained unchanged during compilation and tests.

Two targeted browser cases passed on their first execution,8.1s total, zero retries/skips, viewport320 and1440px. The canonical IDE URL `/projects/<fixture>/ide?panel=git` mounted the real GitTab and custom-remote form.

Both cases verified:
- Focus the Custom remote opener and press Enter: dialog appears, Remote URL receives focus.
- Type a synthetic URL and press Escape: dialog closes and the same opener regains focus.
- Press Enter to reopen: URL regains focus; focus Close and press Enter: dialog closes and opener regains focus.
- Exactly zero configure-remote POSTs throughout.

This complements the previously recorded two network-feedback UI smokes on the earlier build (503/error/retry with controlled responses), which were not rerun. The parent separately reports31 component tests for the keyboard candidate; they were not executed or counted by this browser worker. Do not combine the older22-test/2-smoke receipt and the newer31-test/2-keyboard receipt as one exact-build run.

Local API/Postgres account/project/conversation fixtures reached the real shell. Git status GET was explicitly controlled; no OAuth/provider connection, GitHub credential, remote write, customer project, DNS or production action occurred. No production-authenticated or Safari hardware validation.

Curated screenshots and compact receipts only; no raw traces, API logs or session tokens. No executable archived `.spec.ts` file is included. Own API/web processes stopped, ports5199/3018/55448/56388 closed, isolated database/cache containers retained stopped. No unrelated service touched.
