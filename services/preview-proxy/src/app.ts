import { createHmac, timingSafeEqual } from 'node:crypto';
import { Readable } from 'node:stream';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';

import { INSPECTOR_SCRIPT } from './inspector-script.js';
import { attachPreviewWebSocketProxy } from './preview-ws-proxy.js';
import { REPORTER_SCRIPT } from './reporter-script.js';

/*
 * Upper bound on how large an HTML document we will buffer in memory to inject
 * the inspector script. Anything larger is streamed through unmodified — a
 * multi-MB HTML page never needs inspector injection, and buffering arbitrary
 * upstream bodies would let a large response OOM the proxy.
 */
const MAX_INJECT_BYTES = 4 * 1024 * 1024;

/*
 * Auto-refreshing holding page served for the iframe's top-level navigation when
 * the upstream dev server is bound-but-not-yet-serving (still compiling) or briefly
 * unreachable. The cross-origin preview iframe fires onLoad even for a 5xx body, so
 * returning a JSON error blob here made the IDE mark the broken page as a finished
 * render and strand the user on a `{error:…}` blob. This page tells them the app is
 * starting and reloads itself until the dev server returns a real 200. Asset/XHR
 * requests still receive the machine-readable JSON error.
 */
const PREVIEW_STARTING_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="refresh" content="2"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Starting your app…</title><style>html,body{height:100%;margin:0}body{display:flex;align-items:center;justify-content:center;font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;background:#0d1117;color:#c9d1d9}.box{text-align:center;max-width:420px;padding:24px}.s{width:28px;height:28px;border:3px solid #30363d;border-top-color:#F26207;border-radius:50%;margin:0 auto 16px;animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}h1{font-size:15px;font-weight:600;margin:0 0 6px}p{font-size:13px;color:#8b949e;margin:0}</style></head><body><div class="box"><div class="s"></div><h1>Starting your app…</h1><p>The dev server is booting. This page refreshes automatically.</p></div></body></html>`;

/*
 * Terminal state page (BUG-DEPLOY-002): the deployment host exists but nothing
 * is (or will be) behind it — the build failed or the deployment was deleted.
 * A raw 502 JSON here read as an outage; this states the truth, without the
 * auto-refresh loop of the starting page (nothing will come up).
 */
const DEPLOY_NOT_LIVE_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Deployment not live</title><style>html,body{height:100%;margin:0}body{display:flex;align-items:center;justify-content:center;font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;background:#0d1117;color:#c9d1d9}.box{text-align:center;max-width:440px;padding:24px}.i{width:28px;height:28px;border:3px solid #30363d;border-radius:50%;margin:0 auto 16px;position:relative}.i:after{content:"";position:absolute;inset:6px;border-radius:50%;background:#f85149}h1{font-size:15px;font-weight:600;margin:0 0 6px}p{font-size:13px;color:#8b949e;margin:0}</style></head><body><div class="box"><div class="i"></div><h1>This deployment is not live</h1><p>Its last publish failed or it was deleted. Publish the project again to bring it back.</p></div></body></html>`;

/*
 * True when the request is the iframe's top-level document navigation (vs an asset
 * or XHR sub-request). Only document navigations should get the HTML holding page.
 */
function wantsHtmlDocument(request: FastifyRequest): boolean {
  const dest = String(request.headers['sec-fetch-dest'] ?? '');

  if (dest === 'document' || dest === 'iframe' || dest === 'frame') {
    return true;
  }

  return String(request.headers.accept ?? '').includes('text/html');
}

export interface PreviewProxyOptions {
  logger?: boolean;
  workspaceManagerUrl?: string;
  proxySharedSecret?: string;
  isProduction?: boolean;
  fetchImpl?: typeof fetch;
  resolveAgent?: (workspaceId: string, orgId?: string) => Promise<{ baseUrl: string; token: string } | undefined>;
  requestTimeoutMs?: number;

  /**
   * Per-tenant preview authorization (default OFF). The preview is a
   * cross-origin iframe, so the IDE's `vc_session` cookie (scoped to
   * app.e-code.ai, no Domain attribute) is NEVER sent to the preview host — the
   * proxy therefore cannot see who the requester is. To close the cross-tenant
   * hole (anyone who learns a `workspaceId` can reach another tenant's preview)
   * the app sets a SEPARATE HttpOnly cookie `vc_preview`, scoped to the shared
   * parent domain (`Domain=.e-code.ai`) and HMAC-signed over the caller's orgId.
   * When enforcement is on, the proxy reads + verifies that cookie, derives the
   * orgId, and forwards it to workspace-manager which rejects (403) a workspace
   * owned by a different org. The cookie is stripped before the upstream fetch
   * (the dev server never receives it).
   *
   * This is a DARK-LAUNCH flag: shipped off so production behaviour is
   * unchanged. Activation is a coordinated ops step (set the app cookie first,
   * let it propagate, then flip enforcement) documented in the rollout notes —
   * flipping it before the app emits `vc_preview` would 403 every preview.
   */
  enforceTenant?: boolean;

  /** HMAC secret used to verify the `vc_preview` tenant cookie. */
  tenantSecret?: string;

  /**
   * Private-port enforcement (Replit "private port"; default OFF, dark-launch).
   * When on, a request for a port the project marked private in
   * VIBECORE_PORTS_STATE requires an authenticated preview session (a valid
   * `vc_preview` cookie); without one the proxy returns 401 instead of proxying.
   * Public ports are unaffected. Reads the per-port flag from the api via
   * `apiBaseUrl` (authed with proxySharedSecret); fails OPEN on lookup error so
   * an api hiccup never breaks previews.
   */
  enforcePrivatePorts?: boolean;

  /** In-cluster api base URL for the port-access lookup. */
  apiBaseUrl?: string;

  /**
   * Inject the inspect-to-code bridge into proxied HTML so "Inspect to code"
   * works on remote previews (the same capability WebContainer previews get).
   * Defaults to true.
   */
  injectInspector?: boolean;

  /**
   * Base preview domain (e.g. `preview.e-code.ai`). When set, requests whose
   * Host is a per-preview subdomain `<workspaceId>-<port>.<previewDomain>` are
   * served at the HOST ROOT — the workspace + port come from the host, not the
   * URL path. This is what makes apps with root-relative asset URLs
   * (`/main.js`, `/@vite/client`, the Vite/CRA default) load: the browser
   * requests them at the origin root, which has no `/p/<ws>/<port>/` path
   * prefix, so without host routing they 404 and the app renders blank. Unset
   * (dev/tests) keeps pure path-based `/p/<ws>/<port>` routing.
   */
  previewDomain?: string;

  /**
   * Upstream base for a SERVER DEPLOYMENT (Replit-parity durable runtime). A
   * request whose Host is `d-<deploymentId>.<previewDomain>` is a PUBLIC deployed
   * app (not an IDE preview): it is forwarded straight to the deployment's
   * in-cluster Service with NO agent token, tenant cookie, private-port gate, or
   * inspector injection. `{deploymentId}` is substituted into the template; the
   * default targets the Service the workspace-manager creates for the deploy
   * (`app-<id>` in the workspaces runtime namespace, port 80).
   */
  serverDeployUpstreamTemplate?: string;

  /*
   * workspace-manager base URL + shared secret for the scale-to-zero activator.
   * When set, an unreachable deploy upstream triggers a wake (scale 0→1) before
   * the proxy gives up. Default from WORKSPACE_MANAGER_URL / *_SHARED_SECRET.
   */
  serverDeployManagerUrl?: string;
  serverDeployManagerSecret?: string;
}

/*
 * Same-origin path the injected <script src> points at, served below. Same
 * origin keeps it compatible with a `script-src 'self'` CSP on the preview app.
 */
const INSPECTOR_SCRIPT_PATH = '/__vibecore/inspector-script.js';
const INSPECTOR_MARKER = 'data-vibecore-inspector';

/*
 * Same-origin path the injected reporter <script src> points at, served below.
 * The reporter installs window 'error'/'unhandledrejection' (and console.*)
 * hooks that postMessage runtime errors to the parent IDE, so the IDE's Console
 * DevTools tab is populated for REMOTE previews — not just WebContainer ones,
 * which load public/vibecore-preview-reporter.js directly. Served same-origin so
 * it loads under a `script-src 'self'` CSP on the proxied app.
 */
const REPORTER_SCRIPT_PATH = '/__vibecore/preview-reporter.js';
const REPORTER_MARKER = 'data-vibecore-reporter';

/** Beacon endpoint the reporter posts to when a served page never mounts (blank preview). */
const BLANK_PREVIEW_PATH = '/__vibecore/preview-blank';

type PreviewRouteParams = { workspaceId: string; port: string; '*'?: string };

/*
 * Compute the wildcard subpath for host-based preview routing, matching the
 * normalization Fastify already applies to the path-based `*` wildcard param.
 *
 * The raw request path is still percent-encoded here (the onRequest hook runs
 * before route matching), so an encoded slash (`%2f`) would otherwise survive
 * as a single path segment and slip past the dot-segment `expectedPrefix`
 * guard in handlePreviewRequest — letting `..%2f..%2fcommands/run` escape the
 * `/preview/<port>/` prefix and reach the agent's privileged endpoints WITH
 * its bearer token. Decode first (so `%2f` -> `/`) so `new URL` normalizes the
 * `..` segments and the guard rejects the request exactly as it does for the
 * path-based route. Also strip a leading self-prefix (`p/<ws>/<port>`) carried
 * by the path-based iframe template so we don't forward it upstream.
 */
export function computeHostPreviewSubpath(rawPath: string, workspaceId: string, port: string): string {
  let sub = rawPath.replace(/^\/+/, '');

  /*
   * decodeURIComponent throws on malformed escapes (e.g. a bare `%`); fall back
   * to the raw value in that case — the downstream URL/prefix check rejects it.
   */
  try {
    sub = decodeURIComponent(sub);
  } catch {
    // keep the raw (still-encoded) sub; the prefix guard will reject if unsafe
  }

  const selfPrefix = `p/${workspaceId}/${port}`;

  if (sub === selfPrefix) {
    return '';
  }

  if (sub.startsWith(`${selfPrefix}/`)) {
    return sub.slice(selfPrefix.length + 1);
  }

  return sub;
}

/*
 * Derive the workspace id + port from a per-preview Host header
 * (`<workspaceId>-<port>.<previewDomain>`). The workspace id itself contains
 * hyphens (`ws-<hex>`), so we split on the LAST hyphen of the leftmost label:
 * everything before it is the workspace id, the trailing numeric run is the
 * port. Returns null for anything that is not a valid preview host (the proxy's
 * own service host, health probes, malformed hosts) so those fall through to
 * normal path-based routing.
 */
export function parsePreviewHost(
  hostHeader: string | undefined,
  previewDomain: string | undefined,
): { workspaceId: string; port: string } | null {
  if (!hostHeader || !previewDomain) {
    return null;
  }

  const host = hostHeader.split(':')[0].trim().toLowerCase();

  const suffix = `.${previewDomain
    .trim()
    .toLowerCase()
    .replace(/^\.+|\.+$/g, '')}`;

  if (suffix === '.' || !host.endsWith(suffix)) {
    return null;
  }

  const label = host.slice(0, host.length - suffix.length);

  // Reject multi-level labels: a per-preview host is a single subdomain label.
  if (!label || label.includes('.')) {
    return null;
  }

  const match = /^(.+)-(\d{1,5})$/.exec(label);

  if (!match) {
    return null;
  }

  const port = Number(match[2]);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return null;
  }

  return { workspaceId: match[1], port: String(port) };
}

/*
 * Derive the deployment id from a SERVER-DEPLOY Host header
 * (`d-<deploymentId>.<previewDomain>`). Distinct from parsePreviewHost: a deploy
 * host has a `d-` prefix and NO trailing `-<port>`, so the two never collide (a
 * preview host `<ws>-<port>` fails the `d-` prefix; a deploy host `d-<cuid>`
 * fails the `-<digits>` suffix). The deployment id is a cuid (lowercase
 * alphanumeric), which names the in-cluster Service `app-<deploymentId>`.
 */
export function parseServerDeployHost(
  hostHeader: string | undefined,
  previewDomain: string | undefined,
): { deploymentId: string } | null {
  if (!hostHeader || !previewDomain) {
    return null;
  }

  const host = hostHeader.split(':')[0].trim().toLowerCase();

  const suffix = `.${previewDomain
    .trim()
    .toLowerCase()
    .replace(/^\.+|\.+$/g, '')}`;

  if (suffix === '.' || !host.endsWith(suffix)) {
    return null;
  }

  const label = host.slice(0, host.length - suffix.length);

  // A deploy host is a single subdomain label `d-<cuid>` (no nested dots).
  if (!label || label.includes('.')) {
    return null;
  }

  const match = /^d-([a-z0-9]{6,})$/.exec(label);

  if (!match) {
    return null;
  }

  return { deploymentId: match[1] };
}

/*
 * Build the in-cluster upstream base URL for a server deployment from the
 * template (default: the workspace-manager's `app-<id>` Service on port 80).
 * Returns null when the substituted value is not a usable http(s) URL so a bad
 * template can never proxy to an attacker-influenced host.
 */
export function serverDeployUpstreamUrl(deploymentId: string, template: string): string | null {
  const raw = template.replaceAll('{deploymentId}', deploymentId).replace(/\/+$/, '');

  let url: URL;

  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return null;
  }

  return raw;
}

const DEFAULT_SERVER_DEPLOY_UPSTREAM_TEMPLATE = 'http://app-{deploymentId}.workspaces.svc.cluster.local';

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/*
 * Mint a `vc_preview` tenant token. Format: `<orgId-b64url>.<expEpochMs>.<sig>`
 * where sig = base64url(HMAC-SHA256(secret, `<orgId-b64url>.<expEpochMs>`)).
 * Exported so the app (and tests) sign with the exact same scheme the proxy
 * verifies — the single source of truth for the cookie wire format.
 */
export function signPreviewTenantToken(orgId: string, expiresAtMs: number, secret: string): string {
  const payload = `${base64url(orgId)}.${Math.floor(expiresAtMs)}`;
  const sig = base64url(createHmac('sha256', secret).update(payload).digest());

  return `${payload}.${sig}`;
}

/*
 * Verify a `vc_preview` token and return its orgId, or undefined if the token
 * is absent, malformed, expired, or its signature does not match. Constant-time
 * signature comparison; never throws.
 */
export function verifyPreviewTenantToken(
  token: string | undefined,
  secret: string | undefined,
  nowMs: number,
): string | undefined {
  if (!token || !secret) {
    return undefined;
  }

  const parts = token.split('.');

  if (parts.length !== 3) {
    return undefined;
  }

  const [orgB64, expRaw, sig] = parts;
  const exp = Number(expRaw);

  if (!Number.isInteger(exp) || exp <= nowMs) {
    return undefined;
  }

  const expected = base64url(createHmac('sha256', secret).update(`${orgB64}.${expRaw}`).digest());
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expected);

  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
    return undefined;
  }

  try {
    const orgId = Buffer.from(orgB64.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');

    return orgId.length > 0 ? orgId : undefined;
  } catch {
    return undefined;
  }
}

/*
 * Pull a single cookie value out of a raw Cookie header. Returns undefined when
 * the header is absent or the named cookie is not present. Tolerant of the
 * surrounding `; ` separators and missing values.
 */
export function readCookie(cookieHeader: string | undefined, name: string): string | undefined {
  if (!cookieHeader) {
    return undefined;
  }

  for (const part of cookieHeader.split(';')) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf('=');

    if (eq === -1) {
      continue;
    }

    if (trimmed.slice(0, eq) === name) {
      const raw = trimmed.slice(eq + 1);

      try {
        return decodeURIComponent(raw);
      } catch {
        return raw;
      }
    }
  }

  return undefined;
}

export async function buildPreviewProxyApp(options: PreviewProxyOptions = {}): Promise<FastifyInstance> {
  const isProduction = options.isProduction ?? process.env.NODE_ENV === 'production';

  if (isProduction && !options.resolveAgent) {
    assertProductionDefaultResolverConfig(options);
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const requestTimeoutMs = options.requestTimeoutMs ?? 30_000;
  const injectInspector = options.injectInspector ?? true;
  const previewDomain = options.previewDomain ?? process.env.PREVIEW_DOMAIN;

  const serverDeployUpstreamTemplate =
    options.serverDeployUpstreamTemplate ??
    process.env.SERVER_DEPLOY_UPSTREAM_TEMPLATE ??
    DEFAULT_SERVER_DEPLOY_UPSTREAM_TEMPLATE;

  /*
   * Scale-to-zero activator wiring. When a deploy host resolves but its upstream
   * is unreachable (the app is scaled to 0, or its pod is mid-restart), the proxy
   * asks the workspace-manager to wake it (scale 0→1 + wait for readiness) and
   * retries once. Absent this URL the proxy keeps its old behaviour (serve the
   * starting page / 502) — so scale-to-zero degrades safely to "no auto-wake".
   */
  const serverDeployManagerUrl = (options.serverDeployManagerUrl ?? process.env.WORKSPACE_MANAGER_URL ?? '')
    .trim()
    .replace(/\/$/, '');
  const serverDeployManagerSecret =
    options.serverDeployManagerSecret ?? process.env.WORKSPACE_MANAGER_SHARED_SECRET?.trim();

  const enforceTenant = options.enforceTenant ?? process.env.PREVIEW_PROXY_ENFORCE_TENANT === 'true';
  const tenantSecret = options.tenantSecret ?? process.env.PREVIEW_TENANT_SECRET;
  const enforcePrivatePorts = options.enforcePrivatePorts ?? process.env.PREVIEW_ENFORCE_PRIVATE_PORTS === 'true';
  const apiBaseUrl = (options.apiBaseUrl ?? process.env.API_BASE_URL ?? '').trim().replace(/\/$/, '');
  const proxySharedSecret = options.proxySharedSecret ?? process.env.PREVIEW_PROXY_SHARED_SECRET;

  if (enforceTenant && !tenantSecret) {
    throw new Error('PREVIEW_TENANT_SECRET is required when PREVIEW_PROXY_ENFORCE_TENANT is enabled.');
  }

  if (enforcePrivatePorts && (!apiBaseUrl || !proxySharedSecret || !tenantSecret)) {
    throw new Error(
      'PREVIEW_ENFORCE_PRIVATE_PORTS requires API_BASE_URL, PREVIEW_PROXY_SHARED_SECRET and PREVIEW_TENANT_SECRET.',
    );
  }

  /* Is this workspace's port marked private? Fail-open on any lookup error. */
  const isPortPrivate = async (workspaceId: string, port: string): Promise<boolean> => {
    if (!enforcePrivatePorts || !apiBaseUrl || !proxySharedSecret) {
      return false;
    }

    try {
      const response = await fetchImpl(
        `${apiBaseUrl}/internal/preview/port-access?workspaceId=${encodeURIComponent(workspaceId)}&port=${encodeURIComponent(port)}`,
        { headers: { authorization: `Bearer ${proxySharedSecret}` } },
      );

      if (!response.ok) {
        return false;
      }

      return ((await response.json()) as { private?: boolean })?.private === true;
    } catch {
      return false;
    }
  };

  /* Login-required page shown when a private port is hit without a session. */
  const PRIVATE_PORT_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Private port</title><style>html,body{height:100%;margin:0}body{display:flex;align-items:center;justify-content:center;font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;background:#0d1117;color:#c9d1d9}.box{text-align:center;max-width:420px;padding:24px}h1{font-size:16px;font-weight:600;margin:0 0 8px}p{font-size:13px;color:#8b949e;margin:0}</style></head><body><div class="box"><h1>This port is private</h1><p>Sign in to the workspace owner&apos;s account to view this preview.</p></div></body></html>`;

  const app = Fastify({ logger: options.logger ?? false });

  /*
   * We stream request.raw straight to the upstream agent, so Fastify's default
   * application/json and text/plain parsers must NOT consume the body first.
   * A catch-all no-op parser leaves request.raw intact for every content type;
   * without it, POST/PUT/PATCH bodies are silently dropped.
   */
  app.addContentTypeParser('*', (_req, _payload, done) => done(null, undefined));

  /*
   * The IDE (app.e-code.ai) is cross-origin isolated — it sends
   * `Cross-Origin-Embedder-Policy: credentialless` (entry.server.tsx). Two
   * separate rules then govern embedding the preview as a cross-origin iframe,
   * and BOTH must be satisfied or the frame fails with ERR_BLOCKED_BY_RESPONSE
   * (blank/error frame):
   *   1. CORP — the embedded RESOURCE must allow cross-origin embedding
   *      (`Cross-Origin-Resource-Policy: cross-origin`).
   *   2. COEP — a credentialless/require-corp embedder may only frame a
   *      cross-origin DOCUMENT that itself carries a compatible COEP. A document
   *      with the default (unsafe-none) is blocked outright. CORP alone is NOT
   *      enough for the nested document; the earlier fix set only CORP, so the
   *      preview iframe stayed blocked. Assert COEP `credentialless` too — it
   *      matches the embedder and loads the dev server's own (public, no-cred)
   *      subresources without requiring CORP on each of them.
   * Both are set on every proxied response (harmless on non-document responses),
   * guarded so an upstream that already set them wins.
   */
  app.addHook('onSend', async (_request, reply, payload) => {
    if (!reply.hasHeader('cross-origin-resource-policy')) {
      reply.header('cross-origin-resource-policy', 'cross-origin');
    }

    if (!reply.hasHeader('cross-origin-embedder-policy')) {
      reply.header('cross-origin-embedder-policy', 'credentialless');
    }

    /*
     * Strip the Referer on navigations OUT of the preview so the preview URL —
     * which carries the `workspaceId` (a sensitive capability while per-tenant
     * authz is not yet enforced) — is never leaked to third-party origins the
     * proxied app links to or loads. Defence-in-depth against workspaceId
     * exfiltration via the Referer header.
     */
    if (!reply.hasHeader('referrer-policy')) {
      reply.header('referrer-policy', 'no-referrer');
    }

    return payload;
  });

  app.get('/health', async () => ({ status: 'ok', service: 'preview-proxy' }));

  /*
   * Serve the inspect-to-code bridge from the proxy origin so injected pages
   * can load it under a `script-src 'self'` policy.
   */
  app.get(INSPECTOR_SCRIPT_PATH, async (_request, reply) => {
    reply.header('content-type', 'application/javascript; charset=utf-8');
    reply.header('cache-control', 'public, max-age=3600');

    return reply.send(INSPECTOR_SCRIPT);
  });

  /*
   * Serve the preview error reporter from the proxy origin so injected pages can
   * load it under a `script-src 'self'` policy. Forwards runtime errors to the
   * IDE Console tab for remote previews.
   */
  app.get(REPORTER_SCRIPT_PATH, async (_request, reply) => {
    reply.header('content-type', 'application/javascript; charset=utf-8');
    reply.header('cache-control', 'public, max-age=3600');

    return reply.send(REPORTER_SCRIPT);
  });

  /*
   * Blank-preview beacon. The injected reporter posts here (navigator.sendBeacon)
   * when a served page never mounts its SPA root — so a silent white-screen preview
   * always leaves a server-side trace, independent of the IDE. Body is a tiny
   * best-effort JSON blob; we log a structured line and 204. Never throws.
   */
  app.post(BLANK_PREVIEW_PATH, async (request, reply) => {
    let url = 'unknown';

    try {
      const body = typeof request.body === 'string' ? JSON.parse(request.body) : (request.body as { url?: unknown });

      if (body && typeof body.url === 'string') {
        url = body.url;
      }
    } catch {
      // malformed beacon — still record the event.
    }

    request.log.warn({ event: 'preview.blank', url }, 'preview served but the app never mounted (#root empty)');

    return reply.code(204).send();
  });

  const resolveAgent = options.resolveAgent ?? defaultResolveAgent(options, fetchImpl);

  const lastServerTouchAt = new Map<string, number>();

  /*
   * Ask the workspace-manager to wake a scaled-to-zero deployment (scale 0→1 +
   * wait for readiness). Returns true when a replica is ready. Best-effort: any
   * error (manager unset/unreachable, deployment gone) resolves false so the
   * caller falls back to the starting page rather than throwing.
   */
  /*
   * Tri-state wake: 'ready' → retry the forward; 'starting' → holding page;
   * 'gone' → the manager says the Deployment does not exist (build failed and
   * was torn down, or deleted) — a terminal state page, never a wake loop.
   */
  const wakeServerDeploy = async (deploymentId: string): Promise<'ready' | 'starting' | 'gone'> => {
    if (!serverDeployManagerUrl) {
      return 'starting';
    }

    try {
      const response = await fetchImpl(
        `${serverDeployManagerUrl}/server-deployments/${encodeURIComponent(deploymentId)}/activate`,
        {
          method: 'POST',
          headers: {
            accept: 'application/json',
            ...(serverDeployManagerSecret ? { authorization: `Bearer ${serverDeployManagerSecret}` } : {}),
          },

          // Wake = scale + pull + install + boot; allow well beyond a normal request.
          signal: AbortSignal.timeout(90_000),
        },
      );

      if (response.status === 404) {
        return 'gone';
      }

      if (!response.ok) {
        return 'starting';
      }

      const body = (await response.json().catch(() => ({}))) as { ready?: boolean };

      return body.ready ? 'ready' : 'starting';
    } catch {
      return 'starting';
    }
  };

  /*
   * Record live traffic against a deployment so the manager's idle controller
   * measures inactivity from the LAST request, not the last deploy. Throttled
   * in-memory (once per interval per deployment) and fire-and-forget — it must
   * never add latency to or fail the proxied request.
   */
  /*
   * Per-deployment request counter (billing: $1.20/M requests). Every proxied
   * request increments in memory; the throttled touch below flushes the DELTA
   * to the manager, which accumulates it on the Deployment annotation. A proxy
   * restart loses at most one unflushed window — the failure mode is UNDER-
   * counting, never over-billing.
   */
  const pendingServerRequests = new Map<string, number>();

  const touchServerDeploy = (deploymentId: string) => {
    if (!serverDeployManagerUrl) {
      return;
    }

    pendingServerRequests.set(deploymentId, (pendingServerRequests.get(deploymentId) ?? 0) + 1);

    const now = Date.now();

    if (now - (lastServerTouchAt.get(deploymentId) ?? 0) < 30_000) {
      return;
    }

    lastServerTouchAt.set(deploymentId, now);

    const requests = pendingServerRequests.get(deploymentId) ?? 0;
    pendingServerRequests.set(deploymentId, 0);

    void fetchImpl(`${serverDeployManagerUrl}/server-deployments/${encodeURIComponent(deploymentId)}/touch`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(serverDeployManagerSecret ? { authorization: `Bearer ${serverDeployManagerSecret}` } : {}),
      },
      body: JSON.stringify({ requests }),
      signal: AbortSignal.timeout(5_000),
    }).catch(() => {
      /*
       * Restore the unflushed delta + drop the throttle marker so the next
       * request retries the stamp with nothing lost.
       */
      pendingServerRequests.set(deploymentId, (pendingServerRequests.get(deploymentId) ?? 0) + requests);
      lastServerTouchAt.delete(deploymentId);
    });
  };

  /*
   * Forward a request for a server-deployment host (`d-<id>.<previewDomain>`) to
   * the deployment's in-cluster Service. Unlike the IDE preview path this is a
   * PUBLIC app URL: no agent token, no tenant/private gates, no inspector/reporter
   * injection, no `/preview/<port>/` prefix — the request path/query is forwarded
   * verbatim (byte-exact stream-through both ways). CORP/COEP/referrer headers are
   * still added by the onSend hook so the deployed app can be framed in the IDE.
   *
   * `alreadyWoke` guards the scale-to-zero retry: on an unreachable upstream we
   * wake the deployment once and re-enter; the flag prevents a wake loop.
   */
  const handleServerDeployRequest = async (
    request: FastifyRequest,
    reply: FastifyReply,
    deploymentId: string,
    alreadyWoke = false,
  ): Promise<unknown> => {
    const upstreamBase = serverDeployUpstreamUrl(deploymentId, serverDeployUpstreamTemplate);

    if (!upstreamBase) {
      return reply
        .code(500)
        .send({ error: 'Server deploy upstream misconfigured', code: 'SERVER_DEPLOY_UPSTREAM_INVALID' });
    }

    const rawPath = request.url.startsWith('/') ? request.url : `/${request.url}`;

    let upstream: URL;

    try {
      upstream = new URL(`${upstreamBase}${rawPath}`);
    } catch {
      return reply.code(400).send({ error: 'Invalid deploy path', code: 'SERVER_DEPLOY_PATH_INVALID' });
    }

    /*
     * The resolved host must still be the deploy Service — an app-controlled path
     * can never repoint us off the intended in-cluster upstream origin.
     */
    if (upstream.origin !== new URL(upstreamBase).origin) {
      return reply.code(400).send({ error: 'Invalid deploy path', code: 'SERVER_DEPLOY_PATH_INVALID' });
    }

    const headers: Record<string, string> = { 'x-vibecore-server-deploy': deploymentId };

    for (const [name, value] of Object.entries(request.headers)) {
      if (typeof value !== 'string') {
        continue;
      }

      const lower = name.toLowerCase();

      if (
        lower === 'host' ||
        lower === 'connection' ||
        lower === 'keep-alive' ||
        lower === 'transfer-encoding' ||
        lower === 'content-length' ||
        lower === 'upgrade' ||
        lower === 'forwarded' ||
        lower.startsWith('x-forwarded-') ||
        lower.startsWith('x-vibecore-')
      ) {
        continue;
      }

      headers[name] = value;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);

    let streamingHandoff = false;

    try {
      const upstreamResponse = await fetchImpl(upstream, {
        method: request.method,
        headers,
        body: shouldStreamBody(request.method) ? (request.raw as unknown as ReadableStream<Uint8Array>) : undefined,
        signal: controller.signal,

        // App-controlled code: surface a 3xx verbatim rather than following it in-cluster.
        redirect: 'manual',
        ...({ duplex: 'half' } as Record<string, unknown>),
      });

      // Headers arrived → the connection succeeded; don't abort a long-lived body.
      clearTimeout(timeout);

      // Live traffic → keep the idle controller's clock fresh (throttled, async).
      touchServerDeploy(deploymentId);

      reply.status(upstreamResponse.status);

      const upstreamWasEncoded = upstreamResponse.headers.has('content-encoding');

      upstreamResponse.headers.forEach((value, name) => {
        const lower = name.toLowerCase();

        if (
          lower === 'content-encoding' ||
          lower === 'transfer-encoding' ||
          lower === 'connection' ||
          lower === 'keep-alive' ||
          (upstreamWasEncoded && lower === 'content-length')
        ) {
          return;
        }

        reply.header(name, value);
      });

      if (!upstreamResponse.body) {
        return reply.send();
      }

      streamingHandoff = true;

      const readable = Readable.fromWeb(upstreamResponse.body as ReadableStream<Uint8Array>);
      const clear = () => clearTimeout(timeout);
      readable.on('close', clear);
      readable.on('end', clear);
      readable.on('error', clear);
      reply.raw.on('close', () => {
        if (!reply.raw.writableFinished) {
          controller.abort();
        }
      });

      return reply.send(readable);
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        return reply.code(504).send({ error: 'Deploy upstream timeout', code: 'SERVER_DEPLOY_UPSTREAM_TIMEOUT' });
      }

      /*
       * Scale-to-zero wake path: an unreachable upstream (connection refused / no
       * endpoints) is the expected signal that the app is asleep at 0 replicas.
       * Ask the manager to wake it, then retry the forward exactly once. The
       * `alreadyWoke` guard prevents a wake loop if it comes up unreachable again.
       */
      if (!alreadyWoke) {
        clearTimeout(timeout);

        const woke = await wakeServerDeploy(deploymentId);

        if (woke === 'ready') {
          return handleServerDeployRequest(request, reply, deploymentId, true);
        }

        if (woke === 'gone') {
          /*
           * Terminal: nothing is behind this host and nothing will come up
           * (failed build torn down, or deployment deleted) — BUG-DEPLOY-002.
           */
          if (wantsHtmlDocument(request)) {
            return reply.code(410).type('text/html').header('cache-control', 'no-store').send(DEPLOY_NOT_LIVE_HTML);
          }

          return reply
            .code(410)
            .send({ error: 'Deployment is not live (failed or deleted)', code: 'SERVER_DEPLOY_NOT_LIVE' });
        }

        /*
         * Couldn't wake it in time — fall through to the starting page below so a
         * document navigation auto-refreshes while it finishes booting.
         */
      }

      /*
       * Not-yet-ready or unreachable deploy Service: surface a starting/holding page
       * for a document navigation, a JSON error otherwise (mirrors the preview path).
       */
      if (wantsHtmlDocument(request)) {
        return reply.code(503).type('text/html').header('cache-control', 'no-store').send(PREVIEW_STARTING_HTML);
      }

      return reply
        .code(502)
        .send({ error: 'Deploy upstream error', code: 'SERVER_DEPLOY_UPSTREAM_ERROR', detail: error?.message });
    } finally {
      if (!streamingHandoff) {
        clearTimeout(timeout);
      }
    }
  };

  const handlePreviewRequest = async (request: FastifyRequest<{ Params: PreviewRouteParams }>, reply: FastifyReply) => {
    const params = request.params;
    const portNumber = Number(params.port);

    if (!Number.isInteger(portNumber) || portNumber < 1 || portNumber > 65535) {
      return reply.code(400).send({ error: 'Invalid preview port', code: 'PREVIEW_PORT_INVALID' });
    }

    /*
     * Per-tenant authorization (dark-launched, see PreviewProxyOptions.enforceTenant).
     * Derive the requester's orgId from the signed `vc_preview` cookie and pass it
     * to the resolver, which forwards it to workspace-manager for an ownership
     * check. When enforcement is on, a missing/invalid cookie is a hard 403 — we
     * never fall back to the unauthenticated path that leaks cross-tenant previews.
     */
    let requesterOrgId: string | undefined;

    if (enforceTenant) {
      requesterOrgId = verifyPreviewTenantToken(
        readCookie(request.headers.cookie, 'vc_preview'),
        tenantSecret,
        Date.now(),
      );

      if (!requesterOrgId) {
        return reply.code(403).send({ error: 'Preview access denied', code: 'PREVIEW_TENANT_FORBIDDEN' });
      }
    }

    /*
     * Private-port gate (Replit "private port"): if the project marked this port
     * private, require an authenticated preview session (a valid `vc_preview`
     * cookie). Public ports skip this entirely. Dark-launched off.
     */
    if (enforcePrivatePorts && (await isPortPrivate(params.workspaceId, String(portNumber)))) {
      const sessionOrgId =
        requesterOrgId ??
        (tenantSecret
          ? verifyPreviewTenantToken(readCookie(request.headers.cookie, 'vc_preview'), tenantSecret, Date.now())
          : undefined);

      if (!sessionOrgId) {
        return reply.code(401).type('text/html').send(PRIVATE_PORT_HTML);
      }
    }

    const agent = await resolveAgent(params.workspaceId, requesterOrgId).catch(() => undefined);

    if (!agent) {
      return reply.code(404).send({ error: 'Workspace agent not reachable', code: 'PREVIEW_AGENT_NOT_FOUND' });
    }

    const proxyPath = params['*'] ?? '';

    /*
     * Fastify URL-DECODES the wildcard param, so an encoded '?' (%3F) or '#'
     * (%23) in the path arrives literally and, concatenated into the upstream URL
     * string below, is mis-read as the query/fragment delimiter — truncating or
     * corrupting the path. Re-encode just those two delimiters (other special
     * chars are handled by the URL constructor) before building the URL.
     */
    const safeProxyPath = proxyPath.replace(/\?/g, '%3F').replace(/#/g, '%23');
    const upstreamPath = `/preview/${portNumber}/${safeProxyPath}`;
    const queryString = request.url.includes('?') ? request.url.slice(request.url.indexOf('?')) : '';

    let upstream: URL;

    try {
      upstream = new URL(`${agent.baseUrl.replace(/\/$/, '')}${upstreamPath}${queryString}`);
    } catch {
      return reply.code(400).send({ error: 'Invalid preview path', code: 'PREVIEW_PATH_INVALID' });
    }

    /*
     * Reject dot-segment traversal: after URL normalization the resolved path
     * must still live under the agent's /preview/{port}/ prefix. Without this,
     * `..%2f..%2ffiles/read` etc. escape to the agent's privileged endpoints
     * (/files/read, /commands/run), which the proxy would then hit WITH the
     * valid agent bearer token — unauthenticated traversal escalating to RCE.
     */
    const expectedPrefix = `${new URL(`${agent.baseUrl.replace(/\/$/, '')}/`).pathname.replace(/\/$/, '')}/preview/${portNumber}/`;

    if (!upstream.pathname.startsWith(expectedPrefix)) {
      return reply.code(400).send({ error: 'Invalid preview path', code: 'PREVIEW_PATH_INVALID' });
    }

    const headers: Record<string, string> = {
      authorization: `Bearer ${agent.token}`,
      'x-vibecore-workspace': params.workspaceId,
      'x-vibecore-preview-port': String(portNumber),
    };

    for (const [name, value] of Object.entries(request.headers)) {
      if (typeof value !== 'string') {
        continue;
      }

      const lower = name.toLowerCase();

      if (
        lower === 'host' ||
        lower === 'authorization' ||
        lower === 'cookie' ||
        lower === 'connection' ||
        lower === 'keep-alive' ||
        lower === 'transfer-encoding' ||
        lower === 'content-length' ||
        lower === 'upgrade' ||
        lower === 'forwarded' ||
        lower.startsWith('x-forwarded-') ||
        lower.startsWith('x-vibecore-')
      ) {
        continue;
      }

      headers[name] = value;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);

    /*
     * When we hand a Readable to reply.send the body streams AFTER this function
     * returns, so the finally-block clearTimeout would kill the abort timer
     * before the transfer finishes — leaving a stalled upstream body with no
     * timeout. Mark a streaming handoff and clear the timer on stream
     * end/close/error instead so the body transfer stays bounded.
     */
    let streamingHandoff = false;

    const sendStream = (readable: Readable) => {
      streamingHandoff = true;

      const clear = () => clearTimeout(timeout);
      readable.on('close', clear);
      readable.on('end', clear);
      readable.on('error', clear);

      /*
       * Abort the upstream agent fetch if the client disconnects mid-stream. The
       * connect timeout is cleared once headers arrive (so long-lived SSE/HMR
       * bodies aren't truncated), which left the stream-through path — unlike the
       * inject path's body-idle re-arm — with no way to reclaim a still-running
       * upstream when the client goes away. Disconnect-only, so active long-lived
       * streams are unaffected.
       */
      reply.raw.on('close', () => {
        if (!reply.raw.writableFinished) {
          controller.abort();
        }
      });

      return reply.send(readable);
    };

    try {
      const upstreamResponse = await fetchImpl(upstream, {
        method: request.method,
        headers,
        body: shouldStreamBody(request.method) ? (request.raw as unknown as ReadableStream<Uint8Array>) : undefined,
        signal: controller.signal,

        /*
         * Do NOT follow redirects. The path-traversal sandbox + agent resolution
         * validate the INITIAL upstream URL only; with the default redirect:'follow'
         * the workspace dev server (attacker-controlled app code) could 3xx us to
         * an internal address or out of the /preview/{port}/ sandbox while carrying
         * the agent bearer token. Surface the 3xx to the client verbatim instead.
         */
        redirect: 'manual',
        ...({ duplex: 'half' } as Record<string, unknown>),
      });

      /*
       * The timeout bounds connection+headers only. Once the upstream response
       * headers have arrived the connection succeeded, so clear it — otherwise it
       * aborts long-lived/large streamed bodies (SSE, big downloads, slow clients)
       * at 30s mid-transfer. The streamed-body paths below already bound their own
       * lifecycle via stream end/close/error.
       */
      clearTimeout(timeout);

      reply.status(upstreamResponse.status);

      const contentType = upstreamResponse.headers.get('content-type') ?? '';

      /*
       * Only treat the body as injectable HTML when it is UTF-8 (or has no
       * declared charset, which we read as UTF-8). The inspector injection
       * buffers + toString('utf8'); doing that to an ISO-8859-1 / Shift_JIS / etc.
       * page corrupts every non-ASCII byte. For non-UTF-8 HTML, fall through to
       * the byte-exact stream-through path instead of rewriting it.
       */
      const charset = /charset\s*=\s*"?([\w-]+)"?/i.exec(contentType)?.[1]?.toLowerCase();
      const isUtf8 = !charset || charset === 'utf-8' || charset === 'utf8';
      const isHtml = contentType.includes('text/html') && isUtf8;

      /*
       * undici's fetch transparently DECODES gzip/deflate/br bodies — the body
       * we stream is decompressed, but upstreamResponse.headers still reports the
       * original (compressed) content-length. Forwarding that stale length with a
       * decoded body truncates/corrupts every compressed asset. So whenever the
       * upstream declared a content-encoding (which we strip below), we must also
       * drop content-length and let the transfer be length-less/chunked.
       */
      const upstreamWasEncoded = upstreamResponse.headers.has('content-encoding');

      upstreamResponse.headers.forEach((value, name) => {
        const lower = name.toLowerCase();

        if (
          lower === 'content-encoding' ||
          lower === 'transfer-encoding' ||
          lower === 'connection' ||
          lower === 'keep-alive' ||

          // length no longer matches the decoded body
          (upstreamWasEncoded && lower === 'content-length') ||

          // recomputed after a possible body rewrite below
          (isHtml && injectInspector && lower === 'content-length')
        ) {
          return;
        }

        reply.header(name, value);
      });

      if (!upstreamResponse.body) {
        return reply.send();
      }

      /*
       * Only buffer when we actually rewrite the body (HTML inspector injection).
       * The bulk of preview traffic (JS/CSS/images/data) is streamed straight
       * through, so a large asset can never be buffered into the proxy heap.
       */
      if (!(isHtml && injectInspector)) {
        return sendStream(Readable.fromWeb(upstreamResponse.body as ReadableStream<Uint8Array>));
      }

      /*
       * Inspector-injection path: bound the in-memory buffer. If the document is
       * implausibly large for injection, stream it through unmodified instead.
       */
      const declaredLength = Number(upstreamResponse.headers.get('content-length') ?? '');

      if (Number.isFinite(declaredLength) && declaredLength > MAX_INJECT_BYTES) {
        /*
         * Only re-assert content-length when the body is NOT decoded. If the
         * upstream was content-encoded, undici hands us the DECODED stream while
         * declaredLength is the compressed size — setting it truncates the body.
         */
        if (!upstreamWasEncoded) {
          reply.header('content-length', String(declaredLength));
        }

        return sendStream(Readable.fromWeb(upstreamResponse.body as ReadableStream<Uint8Array>));
      }

      /*
       * Content-Length absent/chunked (Number('')===0, Number(undefined)===NaN):
       * the old arrayBuffer() here still materialized the whole body before the
       * size check, so a large no-Content-Length response could OOM the proxy.
       * Read through a bounded reader instead and bail to pass-through streaming
       * the moment we cross the cap, so nothing is ever fully buffered.
       */
      const reader = (upstreamResponse.body as ReadableStream<Uint8Array>).getReader();
      const chunks: Uint8Array[] = [];

      let total = 0;
      let overflow = false;

      /*
       * Body-phase idle deadline. The connect timeout was cleared at line 277, so
       * without this a slow-loris upstream (the user's dev server trickling a few
       * bytes at a time) would hold this read loop — and the proxy handler — open
       * indefinitely. Re-arm on every chunk; abort the upstream if a read stalls
       * longer than requestTimeoutMs.
       */
      let bodyIdle: ReturnType<typeof setTimeout> | undefined;

      const armBodyIdle = () => {
        clearTimeout(bodyIdle);
        bodyIdle = setTimeout(() => controller.abort(), requestTimeoutMs);
      };

      try {
        armBodyIdle();

        for (;;) {
          const { done, value } = await reader.read();

          if (done) {
            break;
          }

          armBodyIdle();

          if (value) {
            chunks.push(value);
            total += value.length;

            if (total > MAX_INJECT_BYTES) {
              overflow = true;
              break;
            }
          }
        }
      } finally {
        clearTimeout(bodyIdle);
      }

      if (overflow) {
        // Too large to inject — stream the prefix already read, then the rest.
        const prefix = chunks;

        async function* passthrough() {
          try {
            for (const chunk of prefix) {
              yield chunk;
            }

            for (;;) {
              const { done, value } = await reader.read();

              if (done) {
                break;
              }

              if (value) {
                yield value;
              }
            }
          } finally {
            /*
             * Cancel the upstream reader when the generator terminates — including
             * early termination when the client disconnects and Readable.from()
             * calls generator.return(). Without this the reader keeps its lock on
             * the upstream body and the upstream socket is never released.
             */
            await reader.cancel().catch(() => {});
          }
        }

        return sendStream(Readable.from(passthrough()));
      }

      /*
       * Non-overflow path: the body was fully read (done), so release the reader's
       * lock on the upstream stream. Only the overflow path hands the reader off to
       * the passthrough generator (which cancels it); here it would otherwise stay
       * locked, leaking the upstream connection.
       */
      reader.releaseLock();

      const bodyBuffer = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
      const injected = injectInspectorScript(bodyBuffer.toString('utf8'));
      const outBuffer = Buffer.from(injected, 'utf8');
      reply.header('content-length', String(outBuffer.length));

      return reply.send(outBuffer);
    } catch (error: any) {
      /*
       * A still-compiling / briefly-unreachable dev server means the app is starting,
       * not broken. For the iframe's document navigation, serve the auto-refreshing
       * holding page instead of a JSON body the browser would render as a finished
       * page; asset/XHR requests still get the machine-readable error.
       */
      if (wantsHtmlDocument(request)) {
        return reply
          .code(503)
          .header('content-type', 'text/html; charset=utf-8')
          .header('retry-after', '2')
          .header('cache-control', 'no-store')
          .send(PREVIEW_STARTING_HTML);
      }

      if (error?.name === 'AbortError') {
        return reply.code(504).send({ error: 'Preview upstream timeout', code: 'PREVIEW_UPSTREAM_TIMEOUT' });
      }

      return reply
        .code(502)
        .send({ error: 'Preview upstream error', code: 'PREVIEW_UPSTREAM_ERROR', detail: error?.message });
    } finally {
      /*
       * Streamed responses clear the timer on stream completion (see sendStream);
       * only clear here for the fully-buffered/early-return paths.
       */
      if (!streamingHandoff) {
        clearTimeout(timeout);
      }
    }
  };

  app.all('/p/:workspaceId/:port', handlePreviewRequest);
  app.all('/p/:workspaceId/:port/*', handlePreviewRequest);

  /*
   * Host-based preview routing. Runs before route matching so that, on a
   * per-preview host `<ws>-<port>.<previewDomain>`, EVERY path is proxied to the
   * workspace dev server — the workspace + port come from the host, not the URL.
   * This is what lets apps using root-relative asset URLs (the Vite/CRA default,
   * `/main.js`, `/@vite/client`, `/assets/...`) load: the browser requests those
   * at the origin root, which carries no `/p/<ws>/<port>/` path prefix, so pure
   * path routing 404s them and the app renders blank.
   *
   * Exemptions (served by the proxy itself, never forwarded upstream):
   *   - /health                         liveness/readiness
   *   - INSPECTOR_SCRIPT_PATH           the injected inspect-to-code bridge
   *
   * Self-prefix stripping: when the iframe is still loaded via the path-based
   * template (`.../p/<ws>/<port>/`), the document URL itself carries that prefix.
   * If the leading path segment matches THIS host's own `/p/<ws>/<port>`, strip
   * it so we don't forward it to the dev server as an app route. A DIFFERENT
   * `/p/<a>/<b>` (an app's own route) is forwarded verbatim — no collision.
   */
  if (previewDomain) {
    app.addHook('onRequest', async (request, reply) => {
      const path = request.url.split('?')[0].split('#')[0];

      /*
       * Server-deployment host (`d-<id>.<previewDomain>`): a public deployed app.
       * Checked before the preview parse (the two host shapes never collide) and
       * forwarded straight to the deploy Service. Proxy-owned endpoints still win.
       */
      const deploy = parseServerDeployHost(request.headers.host, previewDomain);

      if (deploy) {
        if (
          path === '/health' ||
          path === INSPECTOR_SCRIPT_PATH ||
          path === REPORTER_SCRIPT_PATH ||
          path === BLANK_PREVIEW_PATH
        ) {
          return;
        }

        await handleServerDeployRequest(request, reply, deploy.deploymentId);

        return;
      }

      const parsed = parsePreviewHost(request.headers.host, previewDomain);

      if (!parsed) {
        return; // not a preview host — fall through to path-based routing
      }

      if (
        path === '/health' ||
        path === INSPECTOR_SCRIPT_PATH ||
        path === REPORTER_SCRIPT_PATH ||
        path === BLANK_PREVIEW_PATH
      ) {
        return; // proxy-served endpoints take precedence over host proxying
      }

      const sub = computeHostPreviewSubpath(path, parsed.workspaceId, parsed.port);

      (request as FastifyRequest<{ Params: PreviewRouteParams }>).params = {
        workspaceId: parsed.workspaceId,
        port: parsed.port,
        '*': sub,
      };

      await handlePreviewRequest(request as FastifyRequest<{ Params: PreviewRouteParams }>, reply);
    });
  }

  /*
   * Proxy the Vite HMR WebSocket. The HTTP path above renders the app; without
   * this the HMR ws never upgrades through the proxy and Vite loops "server
   * connection lost. Polling for restart…" (white flicker). Attaches a raw
   * upgrade handler to the underlying server (this proxy has no other ws surface)
   * that pipes the upgrade to the agent's /preview/<port>/ endpoint.
   */
  attachPreviewWebSocketProxy(app.server, {
    previewDomain,
    resolveAgent,
    logger: { warn: (message) => app.log.warn(message) },
  });

  return app;
}

function shouldStreamBody(method: string): boolean {
  return method !== 'GET' && method !== 'HEAD';
}

/*
 * Insert a <script> tag (src + marker) into a proxied HTML document, preferring
 * the position that loads it earliest while staying valid: end of <head>, else
 * start of <body>, else prepend. Idempotent per-marker: if the document already
 * carries that marker (we injected it, or the app self-hosts the script) it is
 * left untouched.
 */
function injectScriptTag(html: string, src: string, marker: string): string {
  if (html.includes(marker)) {
    return html;
  }

  const tag = `<script src="${src}" ${marker}></script>`;

  if (/<\/head>/i.test(html)) {
    return html.replace(/<\/head>/i, `${tag}</head>`);
  }

  if (/<body[^>]*>/i.test(html)) {
    return html.replace(/(<body[^>]*>)/i, `$1${tag}`);
  }

  // No <head>/<body> (fragment or minimal doc): prepend so it still loads.
  return `${tag}${html}`;
}

/*
 * Inject the inspect-to-code bridge AND the preview error reporter into a
 * proxied HTML document.
 *
 * The inspector script is inert until the parent IDE activates it
 * (INSPECTOR_ACTIVATE), so injecting it unconditionally has no effect on the
 * running app. The reporter wires window 'error'/'unhandledrejection' (and
 * console.*) to postMessage so the IDE Console DevTools tab is populated for
 * REMOTE previews — without it the tab is permanently empty in production
 * because the proxy was the only HTML-rewrite point and previously injected
 * only the inspector. Both are idempotent (per-marker), so an upstream page
 * already carrying either marker is never double-injected.
 */
export function injectInspectorScript(html: string): string {
  return injectScriptTag(
    injectScriptTag(html, REPORTER_SCRIPT_PATH, REPORTER_MARKER),
    INSPECTOR_SCRIPT_PATH,
    INSPECTOR_MARKER,
  );
}

function defaultResolveAgent(options: PreviewProxyOptions, fetchImpl: typeof fetch) {
  return async (workspaceId: string, orgId?: string) => {
    const managerUrl = options.workspaceManagerUrl;
    const secret = normalizeSharedSecret(options.proxySharedSecret);

    if (!managerUrl || !secret) {
      return undefined;
    }

    /*
     * Forward the requester's orgId (derived from the verified vc_preview cookie)
     * so workspace-manager can reject a workspace owned by a different org. Only
     * sent when present; the manager treats it as the tenant to authorize against.
     */
    const orgQuery = orgId ? `?orgId=${encodeURIComponent(orgId)}` : '';

    const response = await fetchImpl(
      `${managerUrl.replace(/\/$/, '')}/internal/workspaces/${encodeURIComponent(workspaceId)}/agent${orgQuery}`,
      {
        headers: { authorization: `Bearer ${secret}` },

        // Don't let a hung workspace-manager stall every preview request indefinitely.
        signal: AbortSignal.timeout(10_000),
      },
    );

    if (!response.ok) {
      return undefined;
    }

    const body = (await response.json()) as { baseUrl?: string; token?: string };

    if (!body.baseUrl || !body.token) {
      return undefined;
    }

    return { baseUrl: body.baseUrl, token: body.token };
  };
}

function assertProductionDefaultResolverConfig(options: PreviewProxyOptions) {
  const managerUrl = options.workspaceManagerUrl?.trim();
  const secret = normalizeSharedSecret(options.proxySharedSecret);

  if (!managerUrl) {
    throw new Error('WORKSPACE_MANAGER_URL is required in production for preview-proxy.');
  }

  if (!secret) {
    throw new Error('PREVIEW_PROXY_SHARED_SECRET is required in production for preview-proxy.');
  }

  let url: URL;

  try {
    url = new URL(managerUrl);
  } catch {
    throw new Error('WORKSPACE_MANAGER_URL must be an absolute URL in production for preview-proxy.');
  }

  const isInternalKubernetesService =
    url.protocol === 'http:' && (url.hostname.endsWith('.svc') || url.hostname.endsWith('.svc.cluster.local'));

  const isHttps = url.protocol === 'https:';

  if (!isHttps && !isInternalKubernetesService) {
    throw new Error('WORKSPACE_MANAGER_URL must use HTTPS or an internal Kubernetes service DNS URL in production.');
  }

  if (/^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])$/i.test(url.hostname)) {
    throw new Error('WORKSPACE_MANAGER_URL must not point to localhost in production.');
  }
}

function normalizeSharedSecret(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}
