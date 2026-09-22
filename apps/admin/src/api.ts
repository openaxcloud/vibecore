export interface AdminOverview {
  counts: Record<string, number>;
  cost: { aiCostCents: number; usageEvents: number };
  health: AdminHealth;
  suspendedUserIds: string[];
  suspendedOrganizationIds: string[];
}

export interface AdminHealth {
  kubernetes: { status: string; runtimeClass?: string };
  queues: { status: string; provider?: string };
  database: { status: string; provider?: string };
  redis: { status: string };
}

export interface AdminRecord {
  id?: string;
  key?: string;
  name?: string;
  email?: string;
  organizationId?: string;
  projectId?: string;
  userId?: string;
  status?: string;
  severity?: string;
  action?: string;
  type?: string;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

const API_URL = (import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:3001').replace(/\/+$/, '');

/*
 * AUDX-008 — the admin bearer is no longer persisted in the browser.
 *
 * It used to live in localStorage under `vibecore_admin_token`: a
 * full-privilege PLATFORM ADMIN credential, readable by any script on the
 * origin, surviving reloads indefinitely. One XSS anywhere on the admin origin
 * was a permanent admin takeover.
 *
 * It never needed to be there. `/auth/login` already sets the httpOnly `session`
 * cookie, every call here already sends `credentials: 'include'`, and the API's
 * bearerToken() falls back to `request.cookies.session`. The localStorage copy
 * was a redundant second credential with none of the cookie's protections.
 *
 * The manual token-paste field (an operator convenience for pasting a session
 * token) still works, but the value is held IN MEMORY for the tab only — never
 * written to storage, never surviving a reload.
 */
let inMemoryAdminToken = '';

function authHeaders() {
  return inMemoryAdminToken ? ({ authorization: `Bearer ${inMemoryAdminToken}` } as Record<string, string>) : {};
}

/*
 * Cookie-authenticated mutations require a CSRF header: the API applies
 * requireCsrfToken() whenever a session cookie is present WITHOUT an
 * Authorization header — which is exactly the state this change puts us in.
 * Without this every admin POST/PUT/PATCH/DELETE would 403. The check is
 * presence-based (a cross-site request cannot set a custom header), so the value
 * only has to be non-empty.
 */
const CSRF_HEADER_VALUE = '1';

function csrfHeaders(method: string | undefined) {
  const verb = (method ?? 'GET').toUpperCase();

  return ['POST', 'PUT', 'PATCH', 'DELETE'].includes(verb) ? { 'x-csrf-token': CSRF_HEADER_VALUE } : {};
}

export async function apiJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      accept: 'application/json',
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...authHeaders(),
      ...csrfHeaders(init.method),
      ...(init.headers as Record<string, string> | undefined),
    } as HeadersInit,
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: unknown; code?: unknown };
    throw new Error(String(body.error ?? body.code ?? `Request failed with ${response.status}`));
  }

  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
}

/** In-memory only (AUDX-008). Never persisted: a reload drops it by design. */
export function setAdminToken(token: string) {
  inMemoryAdminToken = token;
}

export function clearAdminToken() {
  inMemoryAdminToken = '';
}

export function getAdminToken() {
  return inMemoryAdminToken;
}

/**
 * Is there a live admin session? Asks the API using the httpOnly cookie instead
 * of reading a token out of storage — which is what makes removing the
 * localStorage copy possible without logging everyone out on reload.
 */
export async function hasAdminSession(): Promise<boolean> {
  try {
    await apiJson('/auth/me');

    return true;
  } catch {
    return false;
  }
}

export async function loginAdmin(email: string, password: string) {
  const response = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    credentials: 'include',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: unknown; code?: unknown };
    throw new Error(String(body.error ?? body.code ?? `Login failed with ${response.status}`));
  }

  /*
   * The response still carries a token (other clients use it), but we
   * deliberately do NOT keep it: the httpOnly cookie set by this same response
   * is what authenticates us from here on.
   */
  const result = (await response.json()) as { token: string };

  return result.token;
}

export async function reauthAdmin(password: string) {
  return apiJson<{ reauthenticated: boolean }>('/auth/reauth', {
    method: 'POST',
    body: JSON.stringify({ password }),
  });
}

export async function exportCsv(path: string, filename: string) {
  const response = await fetch(`${API_URL}${path}${path.includes('?') ? '&' : '?'}format=csv`, {
    credentials: 'include',
    headers: { ...authHeaders(), accept: 'text/csv' } as HeadersInit,
  });

  if (!response.ok) {
    throw Object.assign(new Error(), { code: 'CSV_EXPORT_FAILED', status: response.status });
  }

  const blob = new Blob([await response.text()], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
