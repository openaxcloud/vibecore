import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { isAbsolute } from 'node:path';

/** Vite/dotenv must not silently supplement the allowlisted process environment. */
export function assertNoLocalEnvFiles(directory: string) {
  const loadedCandidates = readdirSync(directory).filter(
    (name) => (name === '.env' || name.startsWith('.env.')) && !name.endsWith('.example'),
  );
  assert.deepEqual(loadedCandidates, [], 'Recipe refuses local .env files; no contents were read');
}

export function baselineEnvironments(path: string, home: string, browsers: string, tenantKey: string) {
  assert.ok(path);
  assert.ok(isAbsolute(home) && isAbsolute(browsers));
  assert.match(tenantKey, /^[a-f0-9]{64}$/);

  const common = {
    PATH: path,
    HOME: home,
    XDG_CONFIG_HOME: home,
    XDG_CACHE_HOME: home,
    TMPDIR: home,
    LANG: 'C.UTF-8',
    TZ: 'UTC',
    CI: 'true',
    HUSKY: '0',
    E2E_PROVIDER_MODE: 'absent',
  };

  return {
    web: {
      ...common,
      NODE_ENV: 'development',
      VITE_DEV_HOST: '127.0.0.1',
      VITE_DEV_PORT: '5173',
      VITE_STRICT_PORT: 'true',
      VITE_RUNTIME_MODE: 'remote-kubernetes',
      VITE_RUNTIME_API_BASE_URL: '/api/runtime',
      RUNTIME_MODE: 'remote-kubernetes',
      RUNTIME_API_BASE_URL: '/api/runtime',
      SAAS_API_URL: 'http://127.0.0.1:3001',
      API_BASE_URL: 'http://127.0.0.1:3001',
      PREVIEW_TENANT_SECRET: tenantKey,
    },
    playwright: { ...common, PLAYWRIGHT_BROWSERS_PATH: browsers, ASTER_BROWSER_BASELINE_ONLY: '1' },
  };
}
