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

export function sessionCookie(token: string) {
  return `${sessionCookieName}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax`;
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
      },
      { status: response.status },
    );
  }

  return payload as T;
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
