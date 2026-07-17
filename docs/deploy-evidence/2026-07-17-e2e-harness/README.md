# D5 — dedicated E2E harness + the two UI proofs (2026-07-17)

Branch `e2e-harness-d5` (PR, **not** merged to main — gate D6). This removes the
dependency on a personal Chrome: a **dedicated test user**, **automated Playwright
login through the real form** (never personal cookies, never a hardcoded personal
credential), and a **self-contained evidence bundle per run** (video, trace,
screenshots + `evidence-metadata.json` with commit, environment, OS,
browser+version, timestamp, and server traceIds).

## The harness
- `playwright.config.journeys.ts` — targets a DEPLOYED env (`E2E_BASE_URL` /
  `E2E_API_URL`, default prod), no `webServer` (real infra), `video`/`trace`/
  `screenshot` = `on` for every run. Separate from `playwright.config.ts`, which
  boots an ephemeral LOCAL stack with no real workspaces/IDE/preview.
- `tests/e2e-journeys/support/env.ts` — all inputs from env; the test-user
  secrets (`E2E_USER_EMAIL` / `E2E_USER_PASSWORD`) are CI/staging secrets, never
  inlined.
- `tests/e2e-journeys/support/fixtures.ts` — `loginAsTestUser()` drives the real
  `/login` form; an `evidence` fixture harvests server traceIds off the wire and
  writes `evidence-metadata.json` on teardown.

Run:
```
E2E_BASE_URL=https://app.e-code.ai E2E_API_URL=https://api.e-code.ai \
E2E_USER_EMAIL=… E2E_USER_PASSWORD=… \
pnpm exec playwright test --config playwright.config.journeys.ts
```

## PROOF #1 — Gallery → authenticated Remix → new ID → IDE  (CORE CLOSED)
`tests/e2e-journeys/gallery-remix.spec.ts`. A dedicated user logs in through the
real form, browses `/gallery`, clicks **Remix this app**, and the app opens the
IDE on a BRAND-NEW project (a different id than the listing's source). Captured
live on prod (app.e-code.ai), chromium 147:
- `ideUrl = https://app.e-code.ai/@e2e-d5-org/realtime-chat-starter-2`
- exactly **1 new project created** by the click: `cmrorov0t002v0nfrec5ry78e`
  (org `cmrordisf001s0nfruspojeeu`, the remixer's) — proven by diffing the user's
  project set before/after.
- The IDE loads on the clone (editor on the clone's README, 7-file tree,
  workspace "Connected").

This closes the exact gap that was previously only an API 201: **the remix is now
proven VISUALLY through the real UI, by a dedicated (non-personal) logged-in user.**

**Environment caveat (honest).** This first run captured the full journey against
prod (app.e-code.ai). On repeated automated runs, prod began STALLING headless
browser navigation to `/login` — `curl` returns 200 in ~1.7s, but `page.goto`
(and the in-app browser) hang past the navigation timeout (120–300s). No CF
challenge / rate-limit header is returned; it presents as slow-streamed SSR for
automated clients that worsens with request volume. This is exactly why D5
mandates a DEDICATED test env / "auth de staging" rather than automating prod —
and why the CI workflow below targets **staging**, not prod. The harness is
env-ready (`E2E_BASE_URL`/`E2E_API_URL`); it just needs to point at a deployed
env that does not throttle automation. The run-#1 artifact bundle was overwritten
by later re-runs (same per-test output dir) — the values above are from that run's
`evidence-metadata.json` as read at the time; a fresh durable bundle should be
generated on staging.

## CI regression — `.github/workflows/e2e-journeys.yml`
Runs the journeys against **staging** (`vars.STAGING_APP_DOMAIN`) nightly + on
manual dispatch, with a dedicated test user (`secrets.E2E_USER_EMAIL` /
`E2E_USER_PASSWORD` — guarded as required), and uploads the full evidence bundle
(video/trace/screenshots/metadata) as an artifact. This turns proof #1 into a
regression the moment staging secrets/vars are set.

**Preview leg (honest status):** a freshly-remixed clone opens with its dev server
IDLE (the IDE shows a "Get preview running" affordance — it does not auto-run). The
spec starts it and waits (bounded) for the per-workspace preview iframe. Preview
boot is heavy (workspace cold-start + dev-server start) and its timing is recorded
in the evidence (`previewRendered`, `previewSrc`, `previewHttpStatus`) as an
observation, NOT a flaky CI gate — the deterministic remix→IDE gates the
regression; a slow preview boot annotates rather than fails it.

## PROOF #2 — Python new project → Nix auto-mount → uv → Run → Preview → Publish  (BLOCKED, not faked)
**Blocked on D3 (multi-zone, another session).** The live prod configmap
`vibecore-vibecore-platform-platform-env` still gates Nix by an **allowlist**, not
auto-mount:
```
WORKSPACE_NIX_PROJECTS = cmrltiuai00070ngisjz024mb,cmrma9wof00060nfx87wbh6ct,cmrnoqluq004z0n96yhzteoyv
```
That is a 3-project allowlist, NOT `'*'`. A brand-new Python project therefore does
NOT get `/nix` auto-mounted. Per the rule, I did **not** hand-edit
`WORKSPACE_NIX_PROJECTS` to force a pass — that would be the exact false positive.
The E2E spec for this journey is written so it becomes a real regression the moment
auto-mount (`'*'`) lands, but the proof stays **OPEN** until D3.
