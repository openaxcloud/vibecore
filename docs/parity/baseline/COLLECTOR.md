# Parity baseline collector (`collect-baseline.mjs`)

Daily + event-driven collector for the public Replit surfaces the parity
program depends on. Output: `docs/parity/baseline/snapshots/<YYYY-MM-DD>/`
(hashed captures + `manifest.json` + WARC) and the append-only observation
ledger `docs/parity/baseline/observations/ledger.jsonl`.

## Why rendered capture (the trap this collector exists for)

Measured 2026-07-17: a raw fetch of `replit.com/community` returns a
**2,891-byte shell** — the `<title>` is there, the content is not. A
fetch-only collector reads "nothing" and concludes "nothing"; that is exactly
how Community Profiles shipped unnoticed. JS routes are therefore archived
**rendered** (headless chromium: DOM serialization + `innerText` extraction +
full-page screenshot, each SHA-256-hashed), never as raw shells.
`status.replit.com` returns HTTP 403 to any plain fetch (measured 2026-07-17,
curl with both bot and browser UAs) — it is also captured rendered.

## The five source families

| family | mode | surfaces |
|---|---|---|
| `documentation` | raw | `llms.txt`, `llms-full.txt`, `sitemap.xml` |
| `product-route` | **rendered** | `replit.com/` · `/pricing` · `/gallery` · `/community` · `community-hub.replit.app` |
| `legal-status` | raw + rendered | terms of service, `trust-and-safety.md`, security docs, status page (rendered) |
| `launch-channel` | raw + rendered | changelog index + per-entry `.md`, blog (raw + rendered), iOS App Store & Google Play listings (native-client release notes) |
| `authenticated-ui` | **manual only** | per-plan / per-region / per-client observations require accounts — see intake below. Automated coverage: **UNKNOWN**, stated in every manifest, never faked. |

## Observation ledger — `eventDate` vs `detectionDate`

Every detected event is appended to
`docs/parity/baseline/observations/ledger.jsonl` with:

`sourceType, observedAt, eventDate, eventDatePrecision, detectionDate,
detectionGapDays, contentHash, archiveUri, plan, region, client, rollout,
criticality, triageSlaHours, triageDueBy, triageState, summary`

- **`eventDate`** — when the thing happened (a changelog entry's own date).
  `null` + `eventDatePrecision: unknown` when not derivable from the capture:
  never guessed.
- **`detectionDate`** — the EARLIEST snapshot on disk whose captures contain
  the evidence (measured backfill over the archive, never invented).
- **`detectionGapDays`** = detection − event: the number that makes our
  blindness measurable. Example from the live ledger: changelog entry
  2026-07-10 first captured 2026-07-16 → gap 6 days.

Observation types: `CHANGELOG_ENTRY`, `WATCH_TERM_FIRST_SEEN`,
`EXPECTATION_REGRESSION`, `SOURCE_FIRST_CAPTURE`, `SOURCE_BLOCKED`, `MANUAL`.

Triage SLA by criticality (recorded per observation as `triageDueBy`):
**P0 = 24h, P1 = 72h, P2 = 168h**. `PENDING` past its due date is counted as
`overdueTriage` in the day's manifest. Entries older than 30 days at first
detection are `ARCHIVED_BACKFILL` (pre-program history — no live SLA).

The hand-curated triage registry is `docs/parity/OBSERVATION_REGISTRY.yaml`
(owned by the registry-reconciliation workflow, NOT written by the collector).
This ledger is the automated detection stream that feeds it.

## Watch terms

`WATCH_TERMS` in the script are scanned case-insensitively over every text
capture of every snapshot day. First sightings become ledger observations; a
term seen NOWHERE is listed in `manifest.watchTermsNeverSeen` — a measured
coverage gap (as of 2026-07-17: “Ramp for Agents” has never appeared in any
captured source; its launch channel is not yet covered).

## Non-regression expectations

Per-source `expect` strings must appear in the capture (text OR markup).
Example — gallery (against the 2026-07-16 live measurement, RPL-17):
`Results`, `Load all apps`, `Submit your App`,
`form.typeform.com/to/yVYAWg79` (external Typeform = curated intake, NOT
self-service), `Views`, `Used`. A miss is an `EXPECTATION_REGRESSION`
observation + a line in `manifest.expectationFailures`. Counts (link counts,
gallery results/categories) are recorded as snapshot properties — never
asserted as constants.

## robots.txt / ToS

RFC 9309, checked per-origin BEFORE any fetch (raw and rendered):
parsed groups honored (longest-match, our token falls back to `*`);
robots.txt 5xx/unreachable → the whole host is treated as disallowed
(`SKIPPED_ROBOTS`); 4xx/absent → no restrictions (recorded as
`no-robots-txt-*` in `manifest.robotsPolicies`). Measured 2026-07-17:
`replit.com` and `docs.replit.com` allow `User-agent: *` on everything we
touch.

## WARC

Each snapshot writes `archive/capture.warc.gz` (WARC/1.1, one gzip member per
record): `warcinfo` + `response` records for raw fetches (reconstructed from
fetch metadata — stated in warcinfo) + `resource` records for rendered DOM
and screenshots. Manifest records the WARC's own sha256/record count.

## Error handling (nothing is papered over)

Per-source statuses: `OK`, `FAILED` (network/HTTP error),
`BLOCKED` (bot wall — marker or 403/429/503), `SKIPPED_ROBOTS`,
`RENDER_UNAVAILABLE` (no browser). Every non-OK status also emits a
`SOURCE_BLOCKED` ledger observation — a wall is an event.

## Cadence + CI

- **Daily**: `.github/workflows/parity-registries.yml`, cron 05:17 UTC (the
  changelog publishes on arbitrary weekdays — Friday-keyed automation is
  forbidden). The job installs chromium and commits snapshot + ledger.
- **Event-driven**: `workflow_dispatch` or
  `repository_dispatch` type `parity-collect`
  (`gh api repos/openaxcloud/vibecore/dispatches -f event_type=parity-collect`).
- **PR smoke** (`render-smoke` job): runs the collector with
  `--require-render` — exits 2 unless EVERY rendered source is OK. This is the
  standing proof that chromium rendering works from GitHub-hosted runners
  without a bot wall (UNK-COLLECTOR-CI-RENDER). If a wall ever appears, the
  job goes red and the fallback is a dedicated renderer service (self-hosted
  runner or browser-rendering API) — not silence.

## Manual intake (authenticated-ui)

Drop JSONL lines into `docs/parity/baseline/observations/manual/*.jsonl`;
the next run validates and merges them (dedup by file+line). Required:
`sourceType: "authenticated-ui"`, `plan`, `client`, `summary`. Optional:
`url, observedAt, eventDate, detectionDate, contentHash, archiveUri, region,
rollout, criticality`. `UNKNOWN` is a valid value; a missing required field
is IGNORED loudly on stderr, never guessed.

```json
{"sourceType":"authenticated-ui","plan":"pro","client":"web","region":"eu","rollout":"gradual","eventDate":"2026-07-16","summary":"Power Ranking visible on Pro profile page, absent on free account"}
```

## Local run

```sh
node scripts/parity/collect-baseline.mjs                  # full run (needs playwright)
node scripts/parity/collect-baseline.mjs --raw-only       # debug without a browser
node scripts/parity/collect-baseline.mjs --require-render # CI smoke gate (exit 2 on any render miss)
```
