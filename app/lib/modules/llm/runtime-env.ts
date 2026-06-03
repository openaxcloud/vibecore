/**
 * Read an env var from the genuine Node process at runtime.
 *
 * `vite-plugin-node-polyfills` (vite.config.ts globals.process=true) injects a
 * browser `process` shim into the SSR bundle whose `env` is `{}`. A bare
 * `process.env.OPENAI_API_KEY` therefore evaluates to undefined in the web pod
 * even though the K8s deployment sets it, so managed provider keys never
 * reached the LLM call and every generation fell back to an unreachable
 * provider. `globalThis.process` is NOT rewritten by the polyfill, so it still
 * points at the real Node process and its populated env. Mirrors the workaround
 * documented in app/lib/enterprise-api.server.ts.
 *
 * This lives in its own dependency-free leaf module so both base-provider and
 * the provider-credentials resolver can share it without forming an import
 * cycle through the LLM manager/registry.
 */
export function readRuntimeEnv(key?: string): string | undefined {
  if (!key) {
    return undefined;
  }

  const runtimeProcess = (globalThis as typeof globalThis & { process?: { env?: Record<string, string | undefined> } })
    .process;

  return runtimeProcess?.env?.[key];
}
