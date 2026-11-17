# Aster: authenticated baseline without volume mutation

Base remains 3f5ce0261a3b1fc97694f904555d6a6916922640. This increment follows the browser and loopback transport patches; their archives are unchanged.

## Corrected authentication conclusion

The previous report established a limitation of the API fallback, not the absence of a normal authenticated preview mechanism. The full source chain is:

1. RuntimeAdapterProvider creates RemoteKubernetesRuntimeAdapter with a project-scoped runtime-ticket resolver. `/api/runtime-token` exchanges the web session server-side. This ticket authenticates runtime HTTP calls and WS/SSE; it is not appended to an iframe URL.
2. Remote adapter `listPorts` and `getPreviewUrl` return API results. API `previewUrlForWorkspacePort` (services/api/src/app.ts:8385) chooses PREVIEW_URL_TEMPLATE/PREVIEW_PROXY_URL when set, otherwise the relative API fallback. No ticket is added to that URL.
3. PreviewsStore stores the port URL as baseUrl (app/lib/stores/previews.ts:434). Preview.tsx copies baseUrl into iframeUrl (around1304), then renders the iframe src (around3174). There is no intervening web fetch that adds an Authorization header.
4. The actual alternative is the dedicated preview-proxy. The authenticated IDE loader calls previewTenantCookie with the resolved organization. app/lib/.server/preview-tenant.ts emits the normal signed HttpOnly vc_preview cookie when PREVIEW_TENANT_SECRET is configured. On loopback it omits Domain; outside production it uses SameSite=Lax without Secure. Cookies are not port-scoped, so two HTTP ports on the same loopback host use this normal cookie path.
5. preview-proxy /p/:workspaceId/:port/* verifies vc_preview with PREVIEW_PROXY_ENFORCE_TENANT=true, then asks manager /internal/workspaces/:id/agent?orgId=... using its server-side shared secret. Manager checks organization ownership; WORKSPACE_MANAGER_ENFORCE_PREVIEW_TENANT=true also refuses an absent orgId. PREVIEW_ENFORCE_PRIVATE_PORTS=true additionally enables the API-backed private-port check. No test-generated session cookie or static browser bearer is needed.

The #925 manifests currently provide neither the preview-proxy service nor PREVIEW_TENANT_SECRET/PREVIEW_PROXY_SHARED_SECRET. Thus the browser baseline still needs this real service wiring on the disposable bench. Use fresh server-side secrets scoped to that bench and the normal loader; never write a browser cookie from the harness. Preserve all tenant/private-port checks.

Minimal origin layout: web+runtime gateway at one exact http://127.0.0.1 port, real preview-proxy at another exact http://127.0.0.1 port. Set the API PREVIEW_URL_TEMPLATE to the latter origin plus `/p/{workspaceId}/{port}/`. Proxy's manager/API addresses must stay on the bench's internal DNS; its agent URLs are internal Kubernetes DNS and cannot be reached by a host-only proxy. Expose only the proxy port via loopback port-forward, as for API in #925. No new public hostname or DNS/network configuration is needed. The browser allowlist accepts the second origin only under /p/<workspace>/<port>/, plus equivalent WS URLs; unrelated origins/paths and AI endpoints remain blocked.

## Concrete non-destructive browser mode

After that compatible, authorized real stack is prepared, invoke:

```sh
E2E_PROVIDER_MODE=absent ASTER_BROWSER_BASELINE_ONLY=1 \
ASTER_BROWSER_ORIGIN=http://127.0.0.1:5175 \
ASTER_BROWSER_PREVIEW_ORIGIN=http://127.0.0.1:3020 \
pnpm exec playwright test --config scripts/aster-browser/playwright.config.ts
```

Ports above are examples and must match the verified bench. No servers or cluster are started by this command. Baseline mode does not open the host IPC interface at all and returns before any inspect/replace request. It uses the real registration/login/ZIP import and iframe marker assertion, retains the actual seed marker and captures actual decision logs. It proves neither direct pod hashes nor volume replacement nor a second opening; the evidence explicitly labels all three as untested. It does not repair files or alter browser storage.

## Writers and exclusion audit

- Browser: ProjectWorkspaceProvider starts on mount, and its reseed branch stops preview then applies the archive. Preview's recovery path can reopen a stopped workspace. The remote adapter's ensureWorkspaceReprovisioned (packages/runtime-remote/src/index.ts:1230) can start a workspace after agent failures, including retried file operations. Parking pages is not a server-side exclusion primitive.
- API: runtime start/restart and file/runtime endpoints can request manager operations; internal/manual scheduled-task execution remains callable even with SCHEDULED_TASKS_SCHEDULER=off. The recipe does disable the scheduled timer, but this does not fence all incoming requests.
- Manager: app.ts exposes start, restart, stop and manual GC. server.ts does not start an autonomous reconciliation timer. The recipe's workspace pods are plain Pods, so no Deployment controller recreates that workspace pod by itself. This does not prevent manager start requests. Existing admission/optimistic guards govern their own operations; no reviewed API holds an exclusion across a caller's external PVC replacement.
- Agent and in-flight commands: processes in the old pod may still write until actual termination is proved. A successful stop response alone is not that proof. The recipe also has its migration Job (completed before testing) and service Deployments; no workspace replacement Job or maintenance lease is supplied.

No admissible replacement fence was established in this lot. Do not attach DELETE. The shortest useful execution is the baseline above on a compatible private bench with the real preview-proxy wiring. Reopening with a new empty volume remains a separate gated step requiring positive exclusion of all creators, independent fixture ownership verification, and conditional UID/resourceVersion operations. Neither an empty pod listing nor browser parking proves that exclusion.

## Validation boundaries

Executed: targeted lint/typecheck, existing tenant-cookie tests, new fixed-origin policy test, loopback gateway/IPC contract tests, and selected preview-proxy tenant/private-cookie tests using its own package configuration. Those proxy tests use injected upstream fixtures, not a real cluster. Playwright discovery only; no browser launched.

The initial proxy test commands from repository root found no tests (exit1: root excludes services; service config paths are relative to its cwd). Rerun from services/preview-proxy uses its existing config, with no exclusions changed. Raw logs are included. Local kind was not retried. No production, other project, AI, external test request, paid resource, push or workflow action occurred.
