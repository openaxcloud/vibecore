import type { RuntimeAdapter, RuntimeMode } from '@vibecore/runtime-contract';
import { RemoteKubernetesRuntimeAdapter } from '@vibecore/runtime-remote';
import { createContext, useContext, useMemo, type PropsWithChildren } from 'react';
import { webcontainerRuntimeAdapter } from '~/lib/webcontainer';

const RuntimeAdapterContext = createContext<RuntimeAdapter | undefined>(undefined);

/*
 * AUDX-004: tickets are scoped to ONE project, so the cache is keyed by project.
 * A single shared slot would hand project B the ticket minted for project A —
 * which the API now rejects (scope mismatch), turning a stale cache into a hard
 * 401 loop rather than a silent over-grant. Keyed, so neither happens.
 */
interface RuntimeTicketCacheEntry {
  token?: string;
  expiry?: number;

  /* Coalesces concurrent refreshes for the same project (single-flight). */
  inflight?: Promise<string | undefined>;
}

const runtimeTicketCache = new Map<string, RuntimeTicketCacheEntry>();

function ticketCacheEntry(projectId: string): RuntimeTicketCacheEntry {
  const existing = runtimeTicketCache.get(projectId);

  if (existing) {
    return existing;
  }

  const created: RuntimeTicketCacheEntry = {};
  runtimeTicketCache.set(projectId, created);

  return created;
}

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

/** Drop cached runtime tickets so the next resolve re-fetches fresh ones. */
export function invalidateRuntimeToken(projectId?: string) {
  if (projectId) {
    const entry = runtimeTicketCache.get(projectId);

    if (entry) {
      entry.token = undefined;
      entry.expiry = undefined;
    }

    return;
  }

  for (const entry of runtimeTicketCache.values()) {
    entry.token = undefined;
    entry.expiry = undefined;
  }
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
      authToken: () => resolveRuntimeAuthToken(options.projectId ?? options.workspaceId),

      /*
       * Activate the adapter's token self-heal. Without this hook wired,
       * shouldRefreshAuthToken() is permanently false, so a runtime token the API
       * rejects BEFORE its client-side expiry clock elapses (session rotation, an
       * api pod restart on deploy, signing-key change) is replayed dead on every
       * HTTP request and every WS reconnect — the file/port-watch sockets 401/4401
       * in a tight loop instead of dropping the stale token and re-minting a fresh
       * one from /api/runtime-token. Clearing the cache lets the next resolve
       * re-fetch, so an interrupted session recovers instead of storming.
       */
      invalidateAuthToken: () => invalidateRuntimeToken(options.projectId ?? options.workspaceId),
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

async function resolveRuntimeAuthToken(projectId: string | undefined) {
  if (typeof window === 'undefined') {
    return undefined;
  }

  /*
   * Fail closed. A ticket has to name a project; minting one without a scope
   * would restore exactly the unscoped credential this change removes.
   */
  if (!projectId) {
    return undefined;
  }

  const entry = ticketCacheEntry(projectId);

  /*
   * AUDX-004: a `runtime-auth-token` localStorage override used to short-circuit
   * this whole function. localStorage is readable by any script on the origin,
   * so it is the one place a runtime credential must never live — and it also
   * bypassed expiry and the single-flight refresh below. Removed outright: the
   * ticket comes from the server, or there is no ticket.
   */

  if (entry.token && entry.expiry && Date.now() < entry.expiry) {
    return entry.token;
  }

  /*
   * Single-flight: the files/watch, ports/watch and logs streams each resolve the
   * auth token independently. Without coalescing they fire parallel
   * /api/runtime-token fetches that race and thrash the cache (a major source of
   * the WS auth-close storm). If a refresh is already in flight, every concurrent
   * caller awaits the same promise.
   */
  if (entry.inflight) {
    return entry.inflight;
  }

  // Expired (or never set): drop it so a stale ticket is never reused on reconnect.
  invalidateRuntimeToken(projectId);

  const fetchPromise = (async (): Promise<string | undefined> => {
    /*
     * The ticket is scoped to a project, so the project has to be named at mint
     * time. Without one the route fails closed (400) rather than issuing an
     * unscoped credential.
     */
    const response = await fetch(`/api/runtime-token?projectId=${encodeURIComponent(projectId)}`, {
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

    entry.token = payload.token;

    const expiry = readJwtExpiryMs(payload.token);
    entry.expiry = (expiry ?? Date.now() + RUNTIME_TOKEN_FALLBACK_TTL_MS) - RUNTIME_TOKEN_REFRESH_SKEW_MS;

    return entry.token;
  })();

  entry.inflight = fetchPromise;

  try {
    return await fetchPromise;
  } finally {
    if (entry.inflight === fetchPromise) {
      entry.inflight = undefined;
    }
  }
}
