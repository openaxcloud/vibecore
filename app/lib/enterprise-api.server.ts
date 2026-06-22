import { createHmac } from 'node:crypto';
import { data as json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from 'react-router';
import { json as jsonResponse } from '~/lib/json-response';

const sessionCookieName = 'vc_session';

/*
 * `vite-plugin-node-polyfills` injects a browser process shim into the SSR
 * bundle (vite.config.ts globals.process=true). That shim ships `env: {}`,
 * so runtime env vars set by the K8s deployment never reach this module —
 * `process.env.SAAS_API_URL` evaluates to undefined in production.
 *
 * `process.env.NODE_ENV` is the one exception: vite's `define` inlines it as
 * a literal string at build time, so the conditional below survives the
 * polyfill. We use it to pick an in-cluster service URL by default so the
 * web pod can still reach the api pod when env wiring is missing. Runtime
 * lookups below intentionally read globalThis.process.env so the Node SSR
 * process wins over the injected browser shim. The
 * production K8s Service is `<release>-<chart>-api` in namespace `vibecore`
 * which resolves to `vibecore-vibecore-platform-api.vibecore.svc.cluster.local`.
 */
const IN_CLUSTER_API_URL = 'http://vibecore-vibecore-platform-api.vibecore.svc.cluster.local:3001';
const LOCAL_DEV_API_URL = 'http://localhost:8787';

type RuntimeProcess = {
  env?: Record<string, string | undefined>;
};

function runtimeEnv() {
  const maybeProcess = (globalThis as typeof globalThis & { process?: RuntimeProcess }).process;

  return maybeProcess?.env ?? {};
}

function envValue(key: string) {
  return runtimeEnv()[key];
}

/*
 * Public accessor for routes that need a runtime env var. Reading
 * `process.env.FOO` directly in a route is a trap: vite-plugin-node-polyfills
 * shims `process.env` to `{}` in the SSR bundle, so K8s-injected env vars are
 * invisible there. Always go through this (it reads `globalThis.process.env`).
 */
export function readEnv(key: string) {
  return envValue(key);
}

function apiBaseUrlFromHostPort() {
  const host = envValue('API_HOST')?.trim();
  const port = envValue('API_PORT')?.trim();

  if (!host && !port) {
    return undefined;
  }

  const hostname = !host || host === '0.0.0.0' || host === '::' ? '127.0.0.1' : host;
  const normalizedHost = hostname.includes(':') && !hostname.startsWith('[') ? `[${hostname}]` : hostname;

  return `http://${normalizedHost}:${port || '3001'}`;
}

export function apiBaseUrl() {
  const fromEnv = envValue('SAAS_API_URL') ?? envValue('API_BASE_URL');

  if (fromEnv && fromEnv.length > 0) {
    return fromEnv;
  }

  const fromHostPort = apiBaseUrlFromHostPort();

  if (fromHostPort) {
    return fromHostPort;
  }

  return envValue('NODE_ENV') === 'production' ? IN_CLUSTER_API_URL : LOCAL_DEV_API_URL;
}

export function readSessionToken(request: Request) {
  const cookie = request.headers.get('cookie') ?? '';

  const match = cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${sessionCookieName}=`));

  if (!match) {
    return undefined;
  }

  const raw = match.slice(sessionCookieName.length + 1);

  try {
    return decodeURIComponent(raw);
  } catch {
    /*
     * Malformed percent-encoding in a client-supplied cookie must not 500 every
     * request; treat it as an absent/invalid token so the user can re-auth.
     */
    return undefined;
  }
}

/*
 * `Secure` is gated on NODE_ENV=production because local dev runs on
 * plain http://localhost — Secure cookies would never be sent, which
 * silently breaks the dev login flow. In production the Remix SSR pod
 * is always served over HTTPS, so the bearer-token-bearing session
 * cookie must be marked Secure to prevent a downgrade attack from
 * leaking it over an attacker-MITMed plaintext channel.
 */
const cookieSecureFlag = envValue('NODE_ENV') === 'production' ? '; Secure' : '';

/*
 * Shared with the OAuth routes so the short-lived anti-CSRF `state` cookie gets
 * the same Secure gating as the session cookie. Without it, the state cookie
 * (which the callback relies on to detect a tampered/forged provider response)
 * would be sent in cleartext on a downgraded/MITMed channel in production.
 */
export function cookieSecure() {
  return cookieSecureFlag;
}

export function sessionCookie(token: string, maxAgeSeconds?: number) {
  const maxAge = typeof maxAgeSeconds === 'number' ? `; Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}` : '';

  return `${sessionCookieName}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax${cookieSecureFlag}${maxAge}`;
}

export function clearSessionCookie() {
  return `${sessionCookieName}=; Path=/; HttpOnly; SameSite=Lax${cookieSecureFlag}; Max-Age=0`;
}

const previewCookieName = 'vc_preview';

function base64url(input: Buffer | string) {
  return (typeof input === 'string' ? Buffer.from(input) : input).toString('base64url');
}

/**
 * Build a signed `vc_preview` cookie binding the active orgId, mirroring the
 * token format preview-proxy's `verifyPreviewTenantToken` expects:
 * `base64url(orgId).<expiresAtMs>.base64url(HMAC-SHA256(payload))`.
 *
 * The preview iframe lives on a SEPARATE host (`*.preview.<domain>`), so the
 * IDE's `vc_session` cookie (no Domain attribute → host-only) is never sent
 * there and the proxy cannot tell who the requester is. This cookie is scoped to
 * the shared parent domain (`Domain=.<PREVIEW_COOKIE_DOMAIN>`) so it IS sent to
 * the preview host, letting the proxy enforce that the workspace belongs to the
 * caller's org. Returns undefined when no preview secret/domain is provisioned
 * (the proxy then stays in legacy unauthenticated mode), so this is safe to call
 * unconditionally from the IDE loader.
 */
export function previewTenantCookie(orgId: string | null | undefined, ttlSeconds = 60 * 60 * 12): string | undefined {
  const secret = envValue('PREVIEW_TENANT_SECRET');
  const domain = envValue('PREVIEW_COOKIE_DOMAIN')?.trim().replace(/^\.+/, '');

  if (!orgId || !secret || !domain) {
    return undefined;
  }

  const expiresAtMs = Date.now() + ttlSeconds * 1000;
  const payload = `${base64url(orgId)}.${expiresAtMs}`;
  const sig = base64url(createHmac('sha256', secret).update(payload).digest());
  const value = `${payload}.${sig}`;

  return `${previewCookieName}=${value}; Path=/; Domain=.${domain}; HttpOnly; SameSite=Lax${cookieSecureFlag}; Max-Age=${ttlSeconds}`;
}

/*
 * Platform-admin accounts created via /auth/register (or promoted via
 * PLATFORM_ADMIN_EMAILS) are forced to enroll MFA before any non-MFA
 * endpoint will respond. The API expresses this as a 403 with
 * `code: 'MFA_REQUIRED'`. Without special handling the dashboard loader
 * would surface a bare "403" to the user. Instead, transparently
 * redirect them to /mfa-setup so they can complete enrollment and
 * resume the request afterwards. The /auth/mfa/* endpoints are exempt
 * from the gate, so the setup page itself never triggers this branch.
 */
const MFA_REQUIRED_REDIRECT_PATH = '/mfa-setup';

export type ApiRequestInit = RequestInit & {
  /*
   * When the upstream API answers 401, the default behaviour is to throw a
   * Remix redirect to `/login?returnTo=…` so authenticated loaders fall back
   * to the sign-in page instead of rendering a bare `<h1>401</h1>` shell.
   * Credential-checking routes (login, signup, password reset, MFA verify,
   * verify-email) opt out so a 401 from "wrong credentials" surfaces as a
   * form error instead of looping the user back through the sign-in flow.
   */
  redirectOn401?: boolean;
};

export function safeReturnTo(value: string | null | undefined): string | undefined {
  if (typeof value !== 'string' || value.length === 0) {
    return undefined;
  }

  // Reject protocol-relative (//evil.com) and absolute URLs to prevent open-redirect.
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) {
    return undefined;
  }

  // Don't bounce back to auth-flow routes — those have their own UX.
  if (/^\/(login|signup|register|forgot-password|reset-password|verify-email|mfa-setup)(?:[/?#]|$)/.test(value)) {
    return undefined;
  }

  return value;
}

export function loginRedirectFromRequest(request: Request) {
  const url = new URL(request.url);
  const returnTo = `${url.pathname}${url.search}`;
  const safe = safeReturnTo(returnTo);

  return safe ? redirect(`/login?returnTo=${encodeURIComponent(safe)}`) : redirect('/login');
}

/*
 * Resource routes (any path under `/api/`) are consumed by `fetch()` from the
 * browser, not by full-page navigations. Redirecting them to `/login` would
 * be transparently followed by `fetch`, leaving the caller with a 200 HTML
 * body where it expected JSON. For those routes we let the original 401
 * propagate so the client-side code can react (e.g. show an inline prompt,
 * trigger a navigation). Page loaders, by contrast, render HTML and benefit
 * from a server-side redirect to the sign-in screen.
 */
function isPageNavigation(request: Request) {
  try {
    return !new URL(request.url).pathname.startsWith('/api/');
  } catch {
    return false;
  }
}

export async function apiRequest<T = unknown>(request: Request, path: string, init: ApiRequestInit = {}) {
  const { redirectOn401 = true, ...fetchInit } = init;
  const token = readSessionToken(request);
  const headers = new Headers(fetchInit.headers);
  headers.set('accept', 'application/json');

  if (fetchInit.body && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }

  if (token && !headers.has('authorization')) {
    headers.set('authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${apiBaseUrl()}${path}`, {
    ...fetchInit,
    headers,

    /*
     * Default timeout so a hung/draining api pod can't stall a Remix
     * loader/action indefinitely. Callers may still pass their own signal.
     */
    signal: fetchInit.signal ?? AbortSignal.timeout(30_000),
  });

  const contentType = response.headers.get('content-type') ?? '';
  const rawBody = await response.text();

  let payload: unknown;

  if (contentType.includes('application/json') && rawBody.length > 0) {
    try {
      payload = JSON.parse(rawBody);
    } catch {
      payload = rawBody;
    }
  } else {
    payload = rawBody;
  }

  if (!response.ok) {
    const payloadCode = typeof payload === 'object' && payload ? (payload as { code?: string }).code : undefined;

    if (
      response.status === 403 &&
      payloadCode === 'MFA_REQUIRED' &&
      !path.startsWith('/auth/mfa') &&
      isPageNavigation(request)
    ) {
      /*
       * Only redirect real page navigations to the MFA page. For /api/ resource
       * routes consumed by fetch() (same guard as the 401 branch), let the 403
       * JSON propagate so the caller can handle it instead of getting an opaque
       * redirect to an HTML page.
       */
      throw redirect(MFA_REQUIRED_REDIRECT_PATH);
    }

    if (response.status === 401 && redirectOn401 && isPageNavigation(request)) {
      throw loginRedirectFromRequest(request);
    }

    /*
     * Throw a real `Response` (not RR7's `data()` sentinel): callers detect
     * these via `error instanceof Response` and read them with
     * `error.clone().json()` / `error.status` (see `apiErrorMessage`,
     * `isApiResponse`, and the signup/admin action catch blocks).
     */
    throw jsonResponse(
      {
        ok: false,
        error:
          typeof payload === 'object' && payload
            ? ((payload as { error?: string }).error ?? 'Request failed')
            : String(payload),
        code: payloadCode,
      },
      { status: response.status },
    );
  }

  return payload as T;
}

export function isApiResponse(error: unknown, status?: number): error is Response {
  return error instanceof Response && (typeof status !== 'number' || error.status === status);
}

export function isForbiddenApiResponse(error: unknown) {
  return isApiResponse(error, 403);
}

export async function apiErrorMessage(error: unknown, fallback = 'Request failed') {
  if (!(error instanceof Response)) {
    return error instanceof Error ? error.message : fallback;
  }

  try {
    const payload = (await error.clone().json()) as { error?: string };
    return payload.error ?? fallback;
  } catch {
    return error.statusText || fallback;
  }
}

export async function firstOrganization(request: Request) {
  const result = await apiRequest<{ organizations: Array<{ id: string; name?: string; slug?: string }> }>(
    request,
    '/orgs',
  );

  const organization = result.organizations[0];

  if (!organization) {
    throw jsonResponse({ ok: false, error: 'No organization found for this user' }, { status: 400 });
  }

  return organization;
}

export async function firstOrganizationOrNull(request: Request) {
  const result = await apiRequest<{ organizations: Array<{ id: string; name?: string; slug?: string }> }>(
    request,
    '/orgs',
  );

  return result.organizations[0] ?? null;
}

export function formObject(formData: FormData) {
  return Object.fromEntries(
    [...formData.entries()].map(([key, value]) => [key, typeof value === 'string' ? value : value.name]),
  );
}

export type EnterpriseActionArgs = ActionFunctionArgs;
export type EnterpriseLoaderArgs = LoaderFunctionArgs;
export { json, redirect };
