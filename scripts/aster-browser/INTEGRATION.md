# Integration investigation and runnable loopback transport

Exact base: `3f5ce0261a3b1fc97694f904555d6a6916922640`, plus the unchanged browser patch `0fc6f529e285e119cd376081bd8c30ba961f1cf1bada5bc4a48b43dee9e42d5a`.

## Implemented and exercised locally

`gateway.ts` binds an ephemeral port on 127.0.0.1. It accepts only two canonical HTTP loopback upstreams. `/api/runtime` and its descendants go to the real API; other paths, including `/api/runtime-token`, remain on the real web server. This preserves the web session-to-runtime-ticket exchange. HTTP headers, status, body and WebSocket upgrades pass through without session fabrication or response substitution. Absolute request targets, ambiguous/encoded paths and AI paths are rejected. The deliberately ASCII synthetic fixture requires no encoded path segments.

The module can be started against an already verified local stack:

```sh
E2E_PROVIDER_MODE=absent pnpm exec tsx -e 'import {startGateway} from "./scripts/aster-browser/gateway.ts"; startGateway("http://127.0.0.1:5173", "http://127.0.0.1:3001").then(({origin}) => console.log(origin))'
```

That stack command was NOT run. The only sockets opened for validation were disposable loopback test servers in `gateway.spec.ts`. Those tests prove real HTTP and WebSocket forwarding, not application authentication, Kubernetes or preview rendering. No test server is used by the browser journey.

## Existing supported pieces, and the authentication gap

- `.github/actions/preparer-pile-e2e/action.yml`: locked install, API startup, `pnpm run build`, then `HOST=127.0.0.1 PORT=5173 NODE_ENV=production pnpm run start:node`. The provider-absent mode rejects four provider keys. This action was read, not executed.
- `.github/workflows/e2e.yml`: `SAAS_API_URL=http://127.0.0.1:3001` drives the web's server-side API requests.
- `scripts/private-runtime-recipe/run.ts`: API and manager run inside kind; only loopback port-forwards expose 3001 and 3010. Its existing GitHub-hosted/event guards remain unchanged; they were not spoofed to start it locally.
- `app/lib/runtime/RuntimeAdapterProvider.tsx:103,126`: build the browser with remote-kubernetes mode and runtime base `/api/runtime`. This must be a build-time choice, not merely a later process environment variable. The existing cloudbuild comment explicitly explains why the web server alone cannot serve these routes.
- `services/api/src/app.ts:8411,20158`: the API fallback preview URL is relative and the proxy authenticates via `authorizeRuntimeWorkspace`.

There is NOT yet a demonstrated supported authenticated iframe path through this loopback combination. Source inspection identifies a concrete mismatch: `app/lib/enterprise-api.server.ts:145` and `app/routes/login.tsx:238` set `vc_session`; API `bearerToken` at `services/api/src/app.ts:2169-2201` accepts Authorization or the `session` cookie (query tokens only for WS/SSE). The iframe uses `src={iframeUrl}` and cannot supply an Authorization header. The web runtime-ticket exchange supplies fetch/WS credentials, not an iframe session cookie. The tenant cookie in `project-ide-loader.server.ts:252` targets the separate tenant-preview mechanism; the API bearer function does not read it.

The gateway deliberately does not rename cookies, mint tickets, inject a bearer or disable authentication. A 401 at baseline under this setup must be reported as an integration failure, never an Aster missing-files result. This is a code-derived finding; no real browser authentication failure was observed in this lot.

## Why no mutating host adapter was attached

`scripts/private-runtime-recipe/checks.ts` already supplies offline kubeconfig/context checks and exact generated cluster naming. `run.ts:assertLocalCluster` also verifies the Docker kind ownership label. These are necessary identity checks, not a maintenance lock.

The browser IPC currently supplies project/workspace IDs from a response; it does not independently bind them to a server-verified newly registered account. A mutating producer must establish this binding before any stop/delete. Matching the IDs in a receipt is insufficient.

More decisively, `services/workspace-manager/src/app.ts:586` exposes stop, while `manager.ts:1624-1666` stops a pod and returns a stopped record; it does not hold a caller-owned exclusion lease through subsequent external PVC deletion/recreation. The optional optimistic guard is not passed by that route and would not reserve such a window anyway. The separate backend helper's UID/resourceVersion DeleteOptions protect the identity of the PVC being deleted, not against a new pod starting to use that same PVC. A pre-delete pod listing and parked browser pages cannot close this race.

Consequently this extension issues NO Kubernetes command and produces NO successful replacement receipt. There is no unsafe fallback. No claim is made that fencing is impossible to implement; it is not supplied by the interfaces inspected here.

Shortest safe continuation: resolve the real authenticated preview integration first; then integrate a trusted orchestrator into a fresh, compatible disposable bench that independently binds the synthetic account/project/workspace, quiesces every creator for the replacement interval and proves ownership before mutation, uses exact UID/resourceVersion deletion, observes a new empty volume read-only, and releases the exclusion before normal IDE opening. This must preserve the archive and let the product perform any reseed. Do not substitute manual cookie injection or runtime file copies. Review that exclusion mechanism before implementing deletion.

Local kind remains blocked by unavailable ip6tables filter support. No cluster retry, kernel/network change, remote workflow, production access, external test traffic, purchase or AI request occurred. Both previously delivered archives remain unchanged. Full application build/CI and the actual browser scenario were not executed in this integration lot.
