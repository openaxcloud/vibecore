import { createContext, useContext, useMemo, type PropsWithChildren } from 'react';
import type { RuntimeAdapter, RuntimeMode } from '@vibecore/runtime-contract';
import { RemoteKubernetesRuntimeAdapter } from '@vibecore/runtime-remote';
import { webcontainerRuntimeAdapter } from '~/lib/webcontainer';

const RuntimeAdapterContext = createContext<RuntimeAdapter | undefined>(undefined);
let cachedRuntimeToken: string | undefined;

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

export const runtimeAdapter = createRuntimeAdapter();

async function resolveRuntimeAuthToken() {
  if (typeof window === 'undefined') {
    return undefined;
  }

  const localToken = localStorage.getItem('runtime-auth-token');

  if (localToken) {
    return localToken;
  }

  if (cachedRuntimeToken) {
    return cachedRuntimeToken;
  }

  const response = await fetch('/api/runtime-token', {
    credentials: 'include',
    headers: { accept: 'application/json' },
  });

  if (!response.ok) {
    return undefined;
  }

  const payload = (await response.json()) as { token?: string };
  cachedRuntimeToken = payload.token;

  return cachedRuntimeToken;
}
