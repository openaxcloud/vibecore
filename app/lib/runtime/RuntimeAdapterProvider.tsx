import type { RuntimeAdapter, RuntimeMode } from '@vibecore/runtime-contract';
import { RemoteKubernetesRuntimeAdapter } from '@vibecore/runtime-remote';
import { createContext, useContext, useMemo, type PropsWithChildren } from 'react';
import { webcontainerRuntimeAdapter } from '~/lib/webcontainer';

const RuntimeAdapterContext = createContext<RuntimeAdapter | undefined>(undefined);

let cachedRuntimeToken: string | undefined;
let cachedRuntimeTokenExpiry: number | undefined;

// Coalesces concurrent /api/runtime-token refreshes (single-flight) — see resolveRuntimeAuthToken.
let inflightTokenFetch: Promise<string | undefined> | undefined;

/*
 * Re-fetch this long before the real expiry so a request never goes out with a
 * token that expires mid-flight. Also the fallback TTL when no exp can be read.
 */
const RUNTIME_TOKEN_REFRESH_SKEW_MS = 30_000;
const RUNTIME_TOKEN_FALLBACK_TTL_MS = 4 * 60_000;

/** Best-effort decode of a JWT `exp` (seconds) into an absolute ms timestamp. */
function readJwtExpiryMs(token: string): number | undefined {
  const segments = token.split('.');

  if (segments.length !== 3) {
    return undefined;
  }

  try {
    const base64 = segments[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(base64)) as { exp?: number };

    return typeof payload.exp === 'number' ? payload.exp * 1000 : undefined;
  } catch {
    return undefined;
  }
}

/** Drop the cached runtime token so the next resolve re-fetches a fresh one. */
export function invalidateRuntimeToken() {
  cachedRuntimeToken = undefined;
  cachedRuntimeTokenExpiry = undefined;
}

export interface RuntimeAdapterProviderProps extends PropsWithChildren {
  adapter?: RuntimeAdapter;
  projectId?: string;
}

export function RuntimeAdapterProvider({ adapter, projectId, children }: RuntimeAdapterProviderProps) {
  const value = useMemo(() => adapter ?? createRuntimeAdapter(undefined, { projectId }), [adapter, projectId]);

  return <RuntimeAdapterContext.Provider value={value}>{children}</RuntimeAdapterContext.Provider>;
}

export function useRuntimeAdapter() {
  const adapter = useContext(RuntimeAdapterContext);

  if (!adapter) {
    throw new Error('RuntimeAdapterProvider is missing from the React tree');
  }

  return adapter;
}

export function getRuntimeMode(): RuntimeMode {
  const explicitMode = (import.meta.env.RUNTIME_MODE ?? import.meta.env.VITE_RUNTIME_MODE) as RuntimeMode | undefined;

  if (explicitMode === 'webcontainer' || explicitMode === 'remote-kubernetes') {
    return explicitMode;
  }

  /*
   * Commercial SaaS deployments must pin RUNTIME_MODE=remote-kubernetes.
   * Local/dev keeps WebContainer as the default so existing Bolt workflows stay unchanged.
   */
  if (import.meta.env.PROD && import.meta.env.VITE_SAAS_COMMERCIAL === 'true') {
    return 'remote-kubernetes';
  }

  return 'webcontainer';
}

export function createRuntimeAdapter(
  mode: RuntimeMode = getRuntimeMode(),
  options: { projectId?: string; workspaceId?: string } = {},
): RuntimeAdapter {
  if (mode === 'remote-kubernetes') {
    return new RemoteKubernetesRuntimeAdapter({
      baseUrl: import.meta.env.RUNTIME_API_BASE_URL ?? import.meta.env.VITE_RUNTIME_API_BASE_URL ?? '/api/runtime',
      authToken: resolveRuntimeAuthToken,
      workspaceId: options.workspaceId ?? options.projectId,
    });
  }

  return webcontainerRuntimeAdapter;
}

let runtimeAdapterSingleton: RuntimeAdapter | undefined;

/**
 * Lazily create + cache the module-singleton runtime adapter, read through a
 * (hoisted) function rather than a module const. This breaks a circular-import
 * TDZ: workbench.ts imports the adapter and instantiates `new WorkbenchStore()`
 * at module load; in the dev (unbundled ESM) graph that field initializer could
 * run before this module finished assigning the const, throwing "Cannot access
 * 'runtimeAdapter' before initialization" — which aborts client hydration and
 * leaves every client-rendered route (login, dashboard, …) stuck on the boot
 * fallback. A hoisted function is callable mid-cycle, so the read is safe.
 */
export function getRuntimeAdapter(): RuntimeAdapter {
  return (runtimeAdapterSingleton ??= createRuntimeAdapter());
}

export const runtimeAdapter = getRuntimeAdapter();

async function resolveRuntimeAuthToken() {
  if (typeof window === 'undefined') {
    return undefined;
  }

  const localToken = localStorage.getItem('runtime-auth-token');

  if (localToken) {
    return localToken;
  }

  if (cachedRuntimeToken && cachedRuntimeTokenExpiry && Date.now() < cachedRuntimeTokenExpiry) {
    return cachedRuntimeToken;
  }

  /*
   * Single-flight: the files/watch, ports/watch and logs streams each resolve the
   * auth token independently. Without coalescing they fire parallel
   * /api/runtime-token fetches that race and thrash the cache (a major source of
   * the WS auth-close storm). If a refresh is already in flight, every concurrent
   * caller awaits the same promise.
   */
  if (inflightTokenFetch) {
    return inflightTokenFetch;
  }

  // Expired (or never set): drop it so a stale token is never reused on reconnect.
  invalidateRuntimeToken();

  const fetchPromise = (async (): Promise<string | undefined> => {
    const response = await fetch('/api/runtime-token', {
      credentials: 'include',
      headers: { accept: 'application/json' },
    });

    if (!response.ok) {
      return undefined;
    }

    /*
     * A 200 with an empty/non-JSON body (proxy or HTML error page) would throw
     * here and reject the auth-token provider that runs on every runtime request
     * and reconnect; treat a parse failure as "no token" instead of crashing.
     */
    let payload: { token?: string };

    try {
      payload = (await response.json()) as { token?: string };
    } catch {
      return undefined;
    }

    if (!payload.token) {
      return undefined;
    }

    cachedRuntimeToken = payload.token;

    const expiry = readJwtExpiryMs(payload.token);
    cachedRuntimeTokenExpiry = (expiry ?? Date.now() + RUNTIME_TOKEN_FALLBACK_TTL_MS) - RUNTIME_TOKEN_REFRESH_SKEW_MS;

    return cachedRuntimeToken;
  })();

  inflightTokenFetch = fetchPromise;

  try {
    return await fetchPromise;
  } finally {
    if (inflightTokenFetch === fetchPromise) {
      inflightTokenFetch = undefined;
    }
  }
}
