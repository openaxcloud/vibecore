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

function authHeaders() {
  const token = localStorage.getItem('vibecore_admin_token') ?? '';
  return token ? ({ authorization: `Bearer ${token}` } as Record<string, string>) : {};
}

export async function apiJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      accept: 'application/json',
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...authHeaders(),
      ...(init.headers as Record<string, string> | undefined),
    } as HeadersInit,
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: unknown; code?: unknown };
    throw new Error(String(body.error ?? body.code ?? `Request failed with ${response.status}`));
  }

  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
}

export function setAdminToken(token: string) {
  localStorage.setItem('vibecore_admin_token', token);
}

export function clearAdminToken() {
  localStorage.removeItem('vibecore_admin_token');
}

export function getAdminToken() {
  return localStorage.getItem('vibecore_admin_token') ?? '';
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

  const result = (await response.json()) as { token: string };
  setAdminToken(result.token);

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
