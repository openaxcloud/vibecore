# Local Load Testing

The five k6 scripts in `tests/load` are restricted to disposable local fixtures.
They are not approved staging/production load tools or a launch-capacity test.

## Safety boundary

- Every script requires explicit `LOCAL_LOAD_PROOF=1` before requests.
- Targets must use HTTP(S) and literal `127.0.0.1` or `[::1]`, an optional valid port and simple path. DNS names (including localhost), credentials, query strings, fragments and percent-encoded URLs are rejected.
- Every request sets numeric `redirects: 0`; global `maxRedirects` is also zero. Request settings prevent redirects even if global options are overridden.
- Verify the loopback service is a disposable fixture. Never use production port-forwards, tunnels, reverse proxies, remote fixtures, HTTP(S) proxies, host overrides, shared/customer data, real billing credentials or live AI providers.
- Do not use cloud execution or remote metric/log outputs. Run k6 on the fixture's own local executor after reviewing its network configuration.
- The guard does not create fixtures or enforce a resource budget. Review effective k6 configuration, ownership, local health and resource limits before traffic.

## Bounded first run

Use an already installed k6 on the disposable fixture executor. After the checks above:

```sh
k6 run -e LOCAL_LOAD_PROOF=1 -e BASE_URL=http://127.0.0.1:3001 -e K6_VUS=1 -e K6_DURATION=10s tests/load/api-load.js
```

BASE_URL defaults to local port 3001; preview selects PREVIEW_URL, BASE_URL, then local port 5173. Use only synthetic local AUTH_TOKEN and billing signatures. Invalid signatures exercise rejection, not successful billing.
K6_VUS and K6_DURATION control profiles. Workspace status includes fixed 30-second ramp-up and ramp-down in addition to its hold. Defaults are not production concurrency recommendations.

## Scope and limits

| Script | Actual scope | Missing launch evidence |
| --- | --- | --- |
| api-load.js | health, readiness and metrics reads | authenticated business workflows |
| workspace-lifecycle-load.js | runtime status reads | creation, startup, persistence |
| preview-load.js | one URL fetch | expected content and public publication |
| ai-simulated-load.js | simulated endpoint | successful generation and cost |
| billing-webhook-load.js | synthetic webhook | signatures, plan transitions, ledger |

Some checks accept controlled refusals or missing routes. HTTP failure thresholds are separate. Green checks do not certify successful customer journeys or capacity for thousands. Separate expected refusals from successes and unexpected errors. Latency thresholds are fixture targets, not a production SLA.

Historical two-API/PostgreSQL/Redis disposable results are in [the isolated recipe](qa/launch-load-20261101/README.md). They exclude production runtime, browser, AI and payment acceptance.

## No-network regression tests

```sh
node --test tests/load/local-load-guard.checks.mjs
```

Node-built-in tests exercise the pure guard and scripts with stub HTTP, without sockets. CI runs them explicitly. The checks filename avoids accidental discovery by Vitest. They are not k6 execution, HTTP redirect integration or performance measurements. k6 runtime validation has not been performed for this patch.

Grafana's [Params documentation](https://grafana.com/docs/k6/latest/javascript-api/k6-http/params/) defines numeric request redirects overriding global maxRedirects. [Option precedence](https://grafana.com/docs/k6/latest/using-k6/k6-options/how-to/) permits CLI/environment global overrides; this is why every request sets zero.
