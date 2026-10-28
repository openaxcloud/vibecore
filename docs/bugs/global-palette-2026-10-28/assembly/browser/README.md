# Assembled #823 + #822 local browser proof

Same handoff.cjs recipe as final palette test, compiled assembly build confirmed exit0 before launch. All six widths320/390/768/1024/1280/1440 passed, height900, zero page errors. Receipt covers old shell detachment, query/focus retention, repeated keyboard opening/reset, Escape return focus, outside dismissal preserving real clicked composer focus on desktop, compact backdrop dismissal without focus theft, resize during query, Database navigation, Back stays closed and second-project isolation.

Source and harness hashes: source.json. Browser log: browser.log. Captures: per-width pending/settled/database PNGs. Server/fixture logs and origins retained. Only synthetic local data and Chromium; external requests, mutations and WebSockets blocked. No real backend/runtime, Safari, physical device or deployment validation. No product/tests edited.

Own fixture9813 and app9814 identities checked before cleanup. Fixture exited onSIGTERM; residual own app requiredSIGKILL afterSIGTERM. Both PIDs absent, wrapper toolsession84587 exited0, browser session74623 exited0. No other processes stopped. Details cleanup.json.
