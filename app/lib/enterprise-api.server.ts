import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from '@remix-run/cloudflare';

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
 * web pod can still reach the api pod when env wiring is missing. The
 * production K8s Service is `<release>-<chart>-api` in namespace `vibecore`
 * which resolves to `vibecore-vibecore-platform-api.vibecore.svc.cluster.local`.
 */
const IN_CLUSTER_API_URL = 'http://vibecore-vibecore-platform-api.vibecore.svc.cluster.local:3001';
const LOCAL_DEV_API_URL = 'http://localhost:8787';

export function apiBaseUrl() {
  const fromEnv = process.env.SAAS_API_URL ?? process.env.API_BASE_URL;

  if (fromEnv && fromEnv.length > 0) {
    return fromEnv;
  }

  return process.env.NODE_ENV === 'production' ? IN_CLUSTER_API_URL : LOCAL_DEV_API_URL;
}

export function readSessionToken(request: Request) {
  const cookie = request.headers.get('cookie') ?? '';

  const match = cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${sessionCookieName}=`));

  return match ? decodeURIComponent(match.slice(sessionCookieName.length + 1)) : undefined;
}

/*
 * `Secure` is gated on NODE_ENV=production because local dev runs on
 * plain http://localhost — Secure cookies would never be sent, which
 * silently breaks the dev login flow. In production the Remix SSR pod
 * is always served over HTTPS, so the bearer-token-bearing session
 * cookie must be marked Secure to prevent a downgrade attack from
 * leaking it over an attacker-MITMed plaintext channel.
 */
const cookieSecureFlag = process.env.NODE_ENV === 'production' ? '; Secure' : '';

export function sessionCookie(token: string, maxAgeSeconds?: number) {
  const maxAge = typeof maxAgeSeconds === 'number' ? `; Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}` : '';

  return `${sessionCookieName}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax${cookieSecureFlag}${maxAge}`;
}

export function clearSessionCookie() {
  return `${sessionCookieName}=; Path=/; HttpOnly; SameSite=Lax${cookieSecureFlag}; Max-Age=0`;
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

export async function apiRequest<T = unknown>(request: Request, path: string, init: RequestInit = {}) {
  const token = readSessionToken(request);
  const headers = new Headers(init.headers);
  headers.set('accept', 'application/json');

  if (init.body && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }

  if (token && !headers.has('authorization')) {
    headers.set('authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${apiBaseUrl()}${path}`, { ...init, headers });
  const contentType = response.headers.get('content-type') ?? '';
  const payload = contentType.includes('application/json') ? await response.json() : await response.text();

  if (!response.ok) {
    const payloadCode = typeof payload === 'object' && payload ? (payload as { code?: string }).code : undefined;

    if (response.status === 403 && payloadCode === 'MFA_REQUIRED' && !path.startsWith('/auth/mfa')) {
      throw redirect(MFA_REQUIRED_REDIRECT_PATH);
    }

    throw json(
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

export function isApiResponse(error: unknown, status?: number) {
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
    throw json({ ok: false, error: 'No organization found for this user' }, { status: 400 });
  }

  return organization;
}

export function formObject(formData: FormData) {
  return Object.fromEntries(
    [...formData.entries()].map(([key, value]) => [key, typeof value === 'string' ? value : value.name]),
  );
}

export type EnterpriseActionArgs = ActionFunctionArgs;
export type EnterpriseLoaderArgs = LoaderFunctionArgs;
export { json, redirect };
