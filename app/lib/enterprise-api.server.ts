import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from '@remix-run/cloudflare';

const sessionCookieName = 'vc_session';

export function apiBaseUrl() {
  return process.env.SAAS_API_URL ?? process.env.API_BASE_URL ?? 'http://localhost:8787';
}

export function readSessionToken(request: Request) {
  const cookie = request.headers.get('cookie') ?? '';
  const match = cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${sessionCookieName}=`));

  return match ? decodeURIComponent(match.slice(sessionCookieName.length + 1)) : undefined;
}

export function sessionCookie(token: string, maxAgeSeconds?: number) {
  const maxAge = typeof maxAgeSeconds === 'number' ? `; Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}` : '';

  return `${sessionCookieName}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax${maxAge}`;
}

export function clearSessionCookie() {
  return `${sessionCookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

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
    throw json(
      {
        ok: false,
        error: typeof payload === 'object' && payload ? ((payload as any).error ?? 'Request failed') : String(payload),
        code: typeof payload === 'object' && payload ? (payload as any).code : undefined,
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
