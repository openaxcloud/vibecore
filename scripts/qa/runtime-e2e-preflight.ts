import { pathToFileURL } from 'node:url';

/** Necessary local services only. A green preflight is NOT a running-workspace proof. */
export async function checkRuntimeServices(
  env: Record<string, string | undefined>,
  request: typeof fetch = fetch,
): Promise<{ service: string; status: 'reachable' }[]> {
  const services = [
    ['api', env.SAAS_API_URL ?? 'http://127.0.0.1:3001'],
    ['workspace-manager', env.WORKSPACE_MANAGER_URL ?? 'http://127.0.0.1:3010'],
  ];

  const results: { service: string; status: 'reachable' }[] = [];

  for (const [service, raw] of services) {
    let endpoint: URL;

    try {
      endpoint = new URL(raw);

      if (
        endpoint.protocol !== 'http:' ||
        !['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname) ||
        endpoint.username ||
        endpoint.password ||
        endpoint.search ||
        endpoint.hash ||
        endpoint.pathname !== '/'
      ) {
        throw new Error('invalid');
      }
    } catch {
      throw new Error(`RUNTIME_E2E_PREFLIGHT_${service.toUpperCase().replaceAll('-', '_')}_LOCAL_URL_REQUIRED`);
    }

    try {
      const response = await request(new URL('/health', endpoint), {
        redirect: 'error',
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok || ((await response.json()) as { status?: string }).status !== 'ok') {
        throw new Error('unhealthy');
      }
    } catch {
      // Do not expose remote response bodies, URLs with credentials or transport diagnostics.
      throw new Error(`RUNTIME_E2E_PREFLIGHT_${service.toUpperCase().replaceAll('-', '_')}_UNAVAILABLE`);
    }
    results.push({ service, status: 'reachable' });
  }

  return results;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  checkRuntimeServices(process.env).then(
    (services) => console.log(JSON.stringify({ event: 'RUNTIME_E2E_PREFLIGHT', services, workspaceProven: false })),
    (error: unknown) => {
      console.error(error instanceof Error ? error.message : 'RUNTIME_E2E_PREFLIGHT_FAILED');
      console.error(
        'Start the isolated API and real workspace-manager before this suite; health alone does not certify pods, execution, preview or publication.',
      );
      process.exitCode = 1;
    },
  );
}
