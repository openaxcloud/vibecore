import { PROVIDER_LIST } from '~/utils/constants';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('managed-provider-keys');

/*
 * DB-first platform provider keys for the WEB LLM path.
 *
 * The web (Remix SSR) has no Prisma, so admin-set provider keys live only in the
 * API's ProviderConfig.apiKeyEnc. This helper fetches the DECRYPTED keys from the
 * API's internal endpoint (gated by the shared internal secret) and overlays them
 * onto a per-request copy of `serverEnv`, keyed by each provider's apiTokenKey /
 * baseUrlKey. base-provider then resolves `managedApiKey = serverEnv[apiTokenKey]`
 * DB-first — while a user BYOK cookie still wins (apiKeys is checked first) and
 * the anti-exfil guard still holds (a managed key is never forwarded to a
 * user-supplied baseUrl). With no DB keys the overlay is a no-op → env fallback,
 * so behaviour is byte-identical to today.
 */

const IN_CLUSTER_API_URL = 'http://vibecore-vibecore-platform-api.vibecore.svc.cluster.local:3001';
const CACHE_TTL_MS = 60_000;
const FETCH_TIMEOUT_MS = 2000;

type ManagedCredential = { apiKey: string; baseUrl: string | null };

let cache: { expiry: number; byProvider: Map<string, ManagedCredential> } | undefined;
let inflight: Promise<Map<string, ManagedCredential>> | undefined;

/** Test seam: drop the in-process cache so a spec's stubbed fetch is re-read. */
export function __resetManagedProviderKeysCacheForTest() {
  cache = undefined;
  inflight = undefined;
}

function ssrEnv(): Record<string, string | undefined> {
  /*
   * The SSR bundle shims a bare `process.env` to {} — read the real values off
   * globalThis, mirroring require-session.ts / ai-usage.ts.
   */
  return ((globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {}) as Record<
    string,
    string | undefined
  >;
}

function apiBaseUrl(): string {
  const env = ssrEnv();
  const fromEnv = env.SAAS_API_URL ?? env.API_BASE_URL ?? env.VITE_API_URL;

  if (fromEnv && fromEnv.length > 0) {
    return fromEnv;
  }

  return process.env.NODE_ENV === 'production' ? IN_CLUSTER_API_URL : 'http://localhost:3001';
}

function internalSecret(): string | undefined {
  const env = ssrEnv();
  const secret = env.INTERNAL_API_SHARED_SECRET ?? env.WORKSPACE_MANAGER_SHARED_SECRET;

  return secret && secret.trim().length > 0 ? secret.trim() : undefined;
}

async function fetchManagedCredentials(): Promise<Map<string, ManagedCredential>> {
  const secret = internalSecret();

  // No internal secret configured → never attempt the call; env fallback covers it.
  if (!secret) {
    return new Map();
  }

  const url = `${apiBaseUrl().replace(/\/+$/, '')}/internal/providers/credentials`;

  const response = await fetch(url, {
    headers: { authorization: `Bearer ${secret}`, accept: 'application/json' },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`internal providers credentials responded ${response.status}`);
  }

  const body = (await response.json()) as {
    providers?: Array<{ provider?: string; apiKey?: string; baseUrl?: string | null }>;
  };

  const byProvider = new Map<string, ManagedCredential>();

  for (const entry of body.providers ?? []) {
    if (entry.provider && typeof entry.apiKey === 'string' && entry.apiKey.trim().length > 0) {
      byProvider.set(entry.provider, { apiKey: entry.apiKey, baseUrl: entry.baseUrl ?? null });
    }
  }

  return byProvider;
}

/*
 * Return the managed provider credentials, cached in-process for CACHE_TTL_MS so
 * a burst of LLM calls doesn't hit the API per request. Never throws: on any
 * failure it returns the last good cache (or an empty map) so env fallback keeps
 * generation working when the API is unreachable.
 */
async function getManagedCredentials(): Promise<Map<string, ManagedCredential>> {
  if (cache && Date.now() < cache.expiry) {
    return cache.byProvider;
  }

  if (inflight) {
    return inflight;
  }

  inflight = fetchManagedCredentials()
    .then((byProvider) => {
      cache = { expiry: Date.now() + CACHE_TTL_MS, byProvider };

      return byProvider;
    })
    .catch((error) => {
      logger.warn(`Failed to fetch managed provider credentials; using env fallback. ${error}`);

      // Keep serving the previous cache if we have one; otherwise an empty map.
      return cache?.byProvider ?? new Map<string, ManagedCredential>();
    })
    .finally(() => {
      inflight = undefined;
    });

  return inflight;
}

/*
 * Build a per-request copy of `serverEnv` with any admin-set DB key/baseUrl
 * overlaid onto each provider's apiTokenKey / baseUrlKey. Returns the input
 * unchanged (a shallow copy) when there are no DB keys. Never throws.
 */
export async function applyManagedProviderKeys<T extends Record<string, unknown> | undefined>(
  serverEnv: T,
): Promise<T> {
  let credentials: Map<string, ManagedCredential>;

  try {
    credentials = await getManagedCredentials();
  } catch {
    return serverEnv;
  }

  if (credentials.size === 0) {
    return serverEnv;
  }

  const overlay: Record<string, unknown> = { ...(serverEnv ?? {}) };

  for (const provider of PROVIDER_LIST) {
    const credential = credentials.get(provider.name);

    if (!credential) {
      continue;
    }

    const apiTokenKey = provider.config.apiTokenKey;

    if (apiTokenKey) {
      overlay[apiTokenKey] = credential.apiKey;
    }

    const baseUrlKey = provider.config.baseUrlKey;

    if (baseUrlKey && credential.baseUrl) {
      overlay[baseUrlKey] = credential.baseUrl;
    }
  }

  return overlay as T;
}
