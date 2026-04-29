import { loadWebContainerAuth } from '@vibecore/runtime-webcontainer';

export type AuthAPI = Awaited<ReturnType<typeof loadWebContainerAuth>>;

export async function auth(): Promise<AuthAPI> {
  return loadWebContainerAuth();
}
