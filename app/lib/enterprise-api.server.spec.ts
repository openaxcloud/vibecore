import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { apiBaseUrl } from './enterprise-api.server';

const ENV_KEYS = ['SAAS_API_URL', 'API_BASE_URL', 'NODE_ENV'] as const;

describe('apiBaseUrl', () => {
  let original: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>;

  beforeEach(() => {
    original = {};

    for (const key of ENV_KEYS) {
      original[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      const value = original[key];

      if (value === undefined) {
        delete process.env[key];
      } else {
        (process.env as Record<string, string>)[key] = value;
      }
    }
  });

  it('prefers SAAS_API_URL when set', () => {
    process.env.SAAS_API_URL = 'https://api.example.com';
    process.env.API_BASE_URL = 'https://other.example.com';

    expect(apiBaseUrl()).toBe('https://api.example.com');
  });

  it('falls back to API_BASE_URL when SAAS_API_URL is unset', () => {
    process.env.API_BASE_URL = 'https://other.example.com';

    expect(apiBaseUrl()).toBe('https://other.example.com');
  });

  it('uses the in-cluster default when no env vars are set in production', () => {
    /*
     * Reproduces the vite-plugin-node-polyfills SSR bug: process.env is {}
     * in the prod bundle, so apiBaseUrl() must pick a working default. The
     * polyfill leaves process.env.NODE_ENV intact because vite `define`
     * inlines it at build time.
     */
    process.env.NODE_ENV = 'production';

    expect(apiBaseUrl()).toBe('http://vibecore-vibecore-platform-api.vibecore.svc.cluster.local:3001');
  });

  it('falls back to localhost in non-production environments', () => {
    process.env.NODE_ENV = 'development';

    expect(apiBaseUrl()).toBe('http://localhost:8787');
  });

  it('treats an empty string env var as unset', () => {
    process.env.SAAS_API_URL = '';
    process.env.API_BASE_URL = '';
    process.env.NODE_ENV = 'production';

    expect(apiBaseUrl()).toBe('http://vibecore-vibecore-platform-api.vibecore.svc.cluster.local:3001');
  });
});
