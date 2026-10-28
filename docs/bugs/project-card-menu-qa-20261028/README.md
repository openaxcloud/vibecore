# Project card menu browser evidence — 28 October 2026

Local, isolated API/Postgres fixtures only. No customer projects, real provider, DNS, production-authenticated session, or Safari hardware tested. Browser blocks nonlocal requests and mutations other than the synthetic fixture's rename. Requests to user preferences remain blocked and logged; they are excluded explicitly from assertions about project mutations.

The browser recipe is archived as `browser-matrix.spec.ts.txt`. Its contents and assertions are unchanged; copy it into an isolated Playwright test directory to reproduce. The initial `.spec.ts` archive name was incorrectly discovered by the repository's unit-test glob and reproduced a Playwright/Vitest collection error. The documentary extension prevents that mistaken collection without changing the unit-test configuration or the actual component tests.

## Builds and scope

Base main: 63e66383055c632865b7ebd27df19aa1a6f6f37f. Initial candidate ProjectCardMenu SHA256: 4088e37265b23c65a66de1ae3a5304d9c6aca6f92e0ffbf68296f37974e16f9d. Client/SSR build exited 0; all 3059 tracked product/package source hashes remained unchanged during compilation.

The second candidate changes only the two deletion-dialog Button minHeight styles to explicit 44px. Product SHA256: 1d23624161335c2c16a5e8e90c89ac62136e2829e6efdb94ddd6e053e88e26f2. Second client/SSR build exited 0 with all 3059 source hashes unchanged. Six targeted browser cases passed in 25.8s, with no retry or skip. Both Cancel and Confirm measured at least 44px.

## Exact test chronology

1. First eight-case run: eight failures. Six geometry cases sampled the menu while its zoom-in animation was still running (approximately 43px); two rename cases were blocked by a harness route guard that omitted React Router's `.data` suffix. These failures did not establish product defects.
2. An archived spec was accidentally collected by recursive test discovery during the next invocation. The process was interrupted (exit 130); archived files were moved outside testDir and `--list` then confirmed exactly eight current cases. This is not a successful or completed validation.
3. Corrected eight-case run: two rename cases passed (320 and 1440px), six cases failed on an overly broad assertion that counted the blocked automatic user-preferences request as a project mutation. The two successful rename cases used the real local BFF/API: the harness replaced the first request's name with an empty value, inducing schema validation failure before a database write; the UI kept the draft, API GET proved the old name remained, and a second untouched rename succeeded and was verified by API GET. Exactly two submission attempts were observed. This replaces the originally planned synthetic 503 with a real validation error induced by a controlled invalid payload.
4. Six targeted cases after correcting the preferences oracle: 320/390/768px reproduced a real 36px Cancel button after animation completion. The global `body button[data-vc-button=true][data-size=default]` min-height 36px rule overrides the component utility class. At 1024px, a harness `body.click(1,1)` intended to trigger blur instead navigated to Organization switcher; that case timed out. The parent requested interruption rather than further redundant waiting: 1440px was interrupted, native zoom200 was not executed. Exit 130. Screenshots and result chronology retained. The next harness uses Tab after Escape, which moves focus without activating a navigation link.

No automatic retries were enabled. These runs must not be summarized as eight first-pass successes. Raw traces/API logs contain local session data and are deliberately excluded from this shareable directory.

5. Final six-case run on the explicit44px candidate: all six passed, covering viewport320/390/768/1024/1440 plus native Chromium zoom200 with CSS viewport320. Menu keyboard navigation, Escape focus restoration, rename Escape+Tab without project mutation, long-name deletion dialog geometry, both44px controls, Cancel and Escape passed. CDP cssVisualViewport.zoom=2 and innerWidth320 were asserted. The two successful API rename cases were not rerun: their prior build differs only by the two deletion-button styles.

Visual inspection: before/after320 screenshots show the 36px→44px change and readable wrapped long name. The rename-error screenshot retains the draft and actionable toast; the new synthetic account also shows the normal onboarding tour. No baseline rebuild or production test was performed.
