# @vibecore/preview-proxy

## Status

This service is the **production preview data plane**. It serves live preview
traffic for every workspace running on `*.preview.e-code.ai` (host-based
routing). It is NOT a dormant shell — `infra/helm/platform/values-prod.yaml`
(`previewDomain: preview.e-code.ai`, `previewUrlTemplate: https://{workspaceId}-{port}.preview.e-code.ai/`)
and `infra/helm/platform/templates/ingress.yaml` route 100% of production
preview traffic through it.

`src/app.ts` is a fully implemented HTTP reverse proxy with tenant-aware
authorization, inspector-script injection, an auto-refreshing "app is starting"
holding page, and host-based routing. The only `/health`-only build of this
service is the staging/dev fallback when `previewDomain` is unset.

## How it routes

The proxy resolves `{workspaceId}` + `{port}` two ways:

- **Host-based (production).** When `PREVIEW_DOMAIN` is set, a request whose Host
  is `<workspaceId>-<port>.<previewDomain>` is served at the host root, so the
  app's root-relative asset URLs (`/main.js`, `/@vite/client`) resolve. See
  `parsePreviewHost` in `src/app.ts`.
- **Path-based (dev/tests).** `/p/<workspaceId>/<port>/*` works when the host is
  not a per-preview subdomain.

For each request the proxy:

1. Resolves the workspace agent base URL + short-lived token from
   workspace-manager (`resolveAgent`, gated on the manager reporting the
   workspace `RUNNING`).
2. Reverse-proxies the HTTP request to the dev server inside the workspace pod,
   streaming the response (including long-lived SSE bodies) back to the iframe.
3. Injects the inspect-to-code bridge (`INSPECTOR_SCRIPT`) into proxied HTML so
   "Inspect to code" works on remote previews.
4. Serves an auto-refreshing HTML holding page (not a JSON error blob) for the
   iframe's top-level document when the dev server is bound-but-not-yet-serving,
   so a still-compiling app does not strand the user on an error page.

## Per-tenant authorization (dark-launched)

The preview is a cross-origin iframe, so the IDE's `vc_session` cookie is never
sent to the preview host — the proxy cannot see the requester from that cookie.
To close the cross-tenant hole (anyone who learns a `workspaceId` could reach
another tenant's running app), the app sets a separate HMAC-signed `vc_preview`
cookie scoped to `Domain=.e-code.ai`. When enforcement is on the proxy reads and
verifies that cookie, derives the orgId, and forwards it to workspace-manager,
which rejects (403) a workspace owned by a different org.

This is controlled by `PREVIEW_PROXY_ENFORCE_TENANT` (+ `PREVIEW_TENANT_SECRET`)
on preview-proxy and `WORKSPACE_MANAGER_ENFORCE_PREVIEW_TENANT` on
workspace-manager. It ships **OFF by default** as a coordinated ops rollout (set
the app cookie first, let it propagate, then flip enforcement — flipping early
would 403 every preview).

> KNOWN GAP — tenant enforcement is not yet wired into `values-prod.yaml`, so in
> production the proxy currently does not derive/forward an orgId. Until these
> flags + `PREVIEW_TENANT_SECRET` are set, production previews are reachable by
> anyone who knows a `workspaceId`. Tracking: enable
> `PREVIEW_PROXY_ENFORCE_TENANT` + `WORKSPACE_MANAGER_ENFORCE_PREVIEW_TENANT` in
> helm prod values once the web app emits the `vc_preview` cookie.

## Known gaps / TODO

- **WebSocket / HMR is NOT proxied.** The proxy forwards HTTP (including
  streamed/SSE bodies) via `fetch`, and it strips the `Upgrade`/`Connection`
  headers — it does not perform a raw WebSocket upgrade. Dev-server HMR sockets
  (Vite `/@vite/client` websocket, etc.) therefore do not connect through the
  proxy, so hot module replacement does not work on remote previews; a manual
  reload is required to see changes. This is a real limitation to close, not a
  harmless future contract.
- **Tenant enforcement** is not yet enabled in production (see above).

## Implementation contract

The proxy currently satisfies (and any rewrite MUST keep):

- A short-lived signed token issued by the API/workspace-manager (`resolveAgent`).
- Refusing requests for workspaces whose workspace-manager state is not
  `RUNNING`.
- Streaming HTTP + SSE bodies with bounded connect timeouts and client-disconnect
  abort.
- An auto-refreshing HTML holding page (never a JSON blob) for the iframe
  document when the upstream is 5xx/unreachable.

To close the WebSocket gap, add a raw `upgrade` handler that pipes the client
socket to an upstream WebSocket connection against the resolved agent URL,
forwarding `Sec-WebSocket-*` / `Upgrade` / `Connection` headers.

## Production validation

`pnpm run platform:no-mocks` is the runtime placeholder scan. Do not introduce
any of its blocked tokens when expanding this service — extend the real
implementation instead.
