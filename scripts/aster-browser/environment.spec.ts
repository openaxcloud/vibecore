import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { assertNoLocalEnvFiles, baselineEnvironments } from './environment.js';

it('refuses dotenv mode files before reading them and accepts documentation examples', () => {
  const directory = mkdtempSync(join(tmpdir(), 'aster-env-test-'));

  try {
    writeFileSync(join(directory, '.env.example'), 'DOCUMENTATION=only');
    expect(() => assertNoLocalEnvFiles(directory)).not.toThrow();

    for (const name of ['.env', '.env.local', '.env.development', '.env.development.local']) {
      writeFileSync(join(directory, name), 'SYNTHETIC_KEY=not-a-real-secret');
      expect(() => assertNoLocalEnvFiles(directory)).toThrow();
      rmSync(join(directory, name));
    }
  } finally {
    rmSync(directory, { recursive: true });
  }
});

it('passes only necessary local configuration; Playwright receives no tenant key', () => {
  const environments = baselineEnvironments('/usr/bin', '/tmp/private-home', '/tmp/browsers', 'a'.repeat(64));
  expect(environments.web.NODE_ENV).toBe('development');
  expect(environments.web.VITE_DEV_HOST).toBe('127.0.0.1');
  expect(environments.web.VITE_STRICT_PORT).toBe('true');
  expect(environments.web.SAAS_API_URL).toBe('http://127.0.0.1:3001');
  expect(environments.playwright).not.toHaveProperty('PREVIEW_TENANT_SECRET');

  for (const env of Object.values(environments)) {
    for (const key of [
      'OPENAI_API_KEY',
      'ANTHROPIC_API_KEY',
      'AWS_PROFILE',
      'GOOGLE_APPLICATION_CREDENTIALS',
      'GITHUB_TOKEN',
      'NODE_OPTIONS',
      'HTTP_PROXY',
      'HTTPS_PROXY',
      'KUBECONFIG',
      'DOTENV_CONFIG_PATH',
    ]) {
      expect(env).not.toHaveProperty(key);
    }
    expect(env.HOME).toBe('/tmp/private-home');
    expect(env.E2E_PROVIDER_MODE).toBe('absent');
  }
});
