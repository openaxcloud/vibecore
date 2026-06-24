import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildDeploymentUrl, staticDeployPublicBaseUrl } from '../deployments.js';
import type { DeploymentRecord, ProjectRecord } from '../store.js';

/*
 * The static deployment URL is persisted on the Deployment row and shown to the
 * user as the live URL of their published app, so it must be browser-reachable.
 * In production SAAS_API_URL is the in-cluster service DNS (svc.cluster.local),
 * which is unreachable from a browser; PUBLIC_API_BASE_URL (https://api.e-code.ai)
 * must take precedence over it.
 */
const SAVED = {
  STATIC_DEPLOY_BASE_URL: process.env.STATIC_DEPLOY_BASE_URL,
  PUBLIC_API_BASE_URL: process.env.PUBLIC_API_BASE_URL,
  SAAS_API_URL: process.env.SAAS_API_URL,
};

beforeEach(() => {
  delete process.env.STATIC_DEPLOY_BASE_URL;
  delete process.env.PUBLIC_API_BASE_URL;
  delete process.env.SAAS_API_URL;
});

afterEach(() => {
  for (const [key, value] of Object.entries(SAVED)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

describe('staticDeployPublicBaseUrl', () => {
  it('prefers the public API base URL over the internal cluster SAAS_API_URL', () => {
    process.env.SAAS_API_URL = 'http://vibecore-vibecore-platform-api.vibecore.svc.cluster.local:3001';
    process.env.PUBLIC_API_BASE_URL = 'https://api.e-code.ai';

    expect(staticDeployPublicBaseUrl()).toBe('https://api.e-code.ai');
  });

  it('honours an explicit STATIC_DEPLOY_BASE_URL above everything', () => {
    process.env.STATIC_DEPLOY_BASE_URL = 'https://cdn.example.com/';
    process.env.PUBLIC_API_BASE_URL = 'https://api.e-code.ai';

    expect(staticDeployPublicBaseUrl()).toBe('https://cdn.example.com');
  });

  it('falls back to SAAS_API_URL only when no public URL is set', () => {
    process.env.SAAS_API_URL = 'http://127.0.0.1:3001/';

    expect(staticDeployPublicBaseUrl()).toBe('http://127.0.0.1:3001');
  });

  it('uses the local-dev default when nothing is configured', () => {
    expect(staticDeployPublicBaseUrl()).toBe('http://127.0.0.1:3001');
  });

  it('builds a browser-reachable static deployment URL in production', () => {
    process.env.SAAS_API_URL = 'http://vibecore-vibecore-platform-api.vibecore.svc.cluster.local:3001';
    process.env.PUBLIC_API_BASE_URL = 'https://api.e-code.ai';

    const project = { id: 'proj_1', slug: 'demo' } as ProjectRecord;
    const deployment = { id: 'dep_abc123', provider: 'static', environment: 'production' } as DeploymentRecord;

    expect(buildDeploymentUrl(project, deployment)).toBe('https://api.e-code.ai/static-deployments/dep_abc123/');
  });
});
